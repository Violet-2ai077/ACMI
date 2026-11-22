// Self-contained OpenAI-compatible SSE client for ST1 (client.mjs)
// Uses only Node.js built-in modules and global fetch. Zero coupling to mainline code or other experiments.
// Persists redacted headers (`Bearer [REDACTED]`) and only retries transport-level errors (408/429/5xx/disconnect).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://opencode.ai/inference/go/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';

function readDshCredentialsYaml() {
  const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  if (!fs.existsSync(credPath)) return {};
  const text = fs.readFileSync(credPath, 'utf8');
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
    if (match) {
      const key = match[1];
      const val = match[2].replace(/^['"]|['"]$/g, '');
      result[key] = val;
    }
  }
  return result;
}

export function resolveApiConfig() {
  const creds = readDshCredentialsYaml();
  const apiKey =
    process.env.TH1_API_KEY ||
    process.env.OPENCODE_GO_API_KEY ||
    process.env.OPENAI_API_KEY ||
    creds.OPENCODE_GO_API_KEY ||
    creds.OPENAI_API_KEY ||
    null;

  const baseUrl = (
    process.env.TH1_BASE_URL ||
    process.env.OPENCODE_GO_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '');

  const model = process.env.TH1_MODEL || DEFAULT_MODEL;

  return {
    apiKey,
    baseUrl,
    endpoint: `${baseUrl}/chat/completions`,
    model
  };
}

export function buildThinkingConfig(reasoningEffort) {
  if (reasoningEffort === 'none') {
    return { type: 'disabled' };
  }
  return { type: 'enabled' };
}

export function parseSseTranscript(rawSseText) {
  const lines = rawSseText.split(/\r?\n/);
  const contentParts = [];
  const reasoningParts = [];
  let model = null;
  let system_fingerprint = null;
  let generation_id = null;
  let finish_reason = null;
  let usage = null;
  let done = false;
  let eventCount = 0;

  let dataLines = [];

  function flushEvent() {
    if (dataLines.length === 0) return;
    const payload = dataLines.join('\n').trim();
    dataLines = [];
    if (!payload) return;
    if (payload === '[DONE]') {
      done = true;
      return;
    }
    const event = JSON.parse(payload);
    eventCount++;
    if (typeof event.id === 'string' && !generation_id) generation_id = event.id;
    if (typeof event.model === 'string' && !model) model = event.model;
    if (event.system_fingerprint !== undefined && system_fingerprint === null) {
      system_fingerprint = event.system_fingerprint;
    }
    if (event.usage != null) {
      usage = event.usage;
    }
    if (Array.isArray(event.choices) && event.choices.length > 0) {
      const choice = event.choices[0];
      const delta = choice.delta || choice.message || {};
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
        reasoningParts.push(delta.reasoning_content);
      } else if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
        reasoningParts.push(delta.reasoning);
      }
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        contentParts.push(delta.content);
      }
      if (choice.finish_reason != null) {
        finish_reason = choice.finish_reason;
      }
    }
  }

  for (const line of lines) {
    if (line === '') {
      flushEvent();
    } else if (line.startsWith('data:')) {
      const val = line.slice(5);
      dataLines.push(val.startsWith(' ') ? val.slice(1) : val);
    }
  }
  flushEvent();

  return {
    id: generation_id,
    model,
    system_fingerprint,
    finish_reason,
    usage,
    reasoning_content: reasoningParts.join(''),
    content: contentParts.join(''),
    done,
    event_count: eventCount
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function callChatCompletion({
  messages,
  sessionKey = 'st1-default',
  reasoningEffort = 'max',
  maxTokens = 8192,
  maxRetries = 3,
  timeoutMs = 180000
}) {
  const config = resolveApiConfig();
  if (!config.apiKey) {
    throw new Error(
      'Missing API key. Set OPENCODE_GO_API_KEY / TH1_API_KEY or configure ~/.dsh/.credentials.yaml.'
    );
  }

  const requestBody = {
    model: config.model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens,
    thinking: buildThinkingConfig(reasoningEffort),
    ...(reasoningEffort !== 'none' ? { reasoning_effort: reasoningEffort } : {}),
    messages
  };

  const redactedHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'acmi-st1-staging/1.0',
    'x-opencode-session': `st1-${sessionKey}`,
    Authorization: 'Bearer [REDACTED]'
  };

  const attemptLogs = [];
  let transportRetries = 0;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          ...redactedHeaders,
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timer);

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawText = await response.text();
      const attemptElapsedMs = Date.now() - attemptStart;

      if (!response.ok) {
        attemptLogs.push({
          attempt,
          status: response.status,
          elapsed_ms: attemptElapsedMs,
          error_body: rawText.slice(0, 1000)
        });

        if (attempt <= maxRetries && isRetryableStatus(response.status)) {
          transportRetries++;
          const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          await sleep(backoffMs);
          continue;
        }

        throw new Error(
          `HTTP ${response.status} after ${attempt} attempt(s): ${rawText.slice(0, 500)}`
        );
      }

      let parsedPayload;
      try {
        if (contentType.includes('text/event-stream') || rawText.trimStart().startsWith('data:')) {
          parsedPayload = parseSseTranscript(rawText);
        } else {
          const jsonObj = JSON.parse(rawText);
          const choice = jsonObj.choices?.[0] || {};
          const msg = choice.message || choice.delta || {};
          parsedPayload = {
            id: jsonObj.id ?? null,
            model: jsonObj.model ?? null,
            system_fingerprint: jsonObj.system_fingerprint ?? null,
            finish_reason: choice.finish_reason ?? null,
            usage: jsonObj.usage ?? null,
            reasoning_content: msg.reasoning_content ?? msg.reasoning ?? '',
            content: msg.content ?? '',
            done: true,
            event_count: 1
          };
        }
      } catch (parseErr) {
        attemptLogs.push({
          attempt,
          status: response.status,
          elapsed_ms: attemptElapsedMs,
          parse_error: String(parseErr.message || parseErr)
        });
        if (attempt <= maxRetries) {
          transportRetries++;
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(`Invalid SSE/JSON from API endpoint: ${rawText.slice(0, 500)}`);
      }

      attemptLogs.push({
        attempt,
        status: response.status,
        elapsed_ms: attemptElapsedMs,
        event_count: parsedPayload.event_count
      });

      const totalElapsedMs = Date.now() - t0;
      const completedAt = new Date().toISOString();

      return {
        endpoint: config.endpoint,
        request_headers: redactedHeaders,
        request_body: requestBody,
        response_body: {
          id: parsedPayload.id,
          model: parsedPayload.model || config.model,
          system_fingerprint: parsedPayload.system_fingerprint,
          finish_reason: parsedPayload.finish_reason,
          usage: parsedPayload.usage,
          event_count: parsedPayload.event_count,
          done: parsedPayload.done
        },
        model: parsedPayload.model || config.model,
        system_fingerprint: parsedPayload.system_fingerprint ?? null,
        usage: {
          prompt_tokens: parsedPayload.usage?.prompt_tokens ?? null,
          completion_tokens: parsedPayload.usage?.completion_tokens ?? null,
          total_tokens: parsedPayload.usage?.total_tokens ?? null,
          reasoning_tokens:
            parsedPayload.usage?.completion_tokens_details?.reasoning_tokens ??
            parsedPayload.usage?.reasoning_tokens ??
            null
        },
        content: parsedPayload.content,
        reasoning_content: parsedPayload.reasoning_content,
        finish_reason: parsedPayload.finish_reason ?? null,
        started_at: startedAt,
        completed_at: completedAt,
        elapsed_ms: totalElapsedMs,
        transport_retries: transportRetries,
        attempt_logs: attemptLogs
      };
    } catch (err) {
      clearTimeout(timer);
      const attemptElapsedMs = Date.now() - attemptStart;
      const isNetworkOrAbort =
        err.name === 'AbortError' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        /fetch failed|network|socket|timed out/i.test(String(err.message || err));

      attemptLogs.push({
        attempt,
        elapsed_ms: attemptElapsedMs,
        error: String(err.message || err)
      });

      if (attempt <= maxRetries && isNetworkOrAbort) {
        transportRetries++;
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Exhausted transport retries');
}
