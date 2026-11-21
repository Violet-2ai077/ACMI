// TC5-B Self-Contained Zero-Dependency OpenAI-Compatible Client
// Uses only Node.js built-in modules: node:fs, node:path, node:os, node:crypto, fetch.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { PROTOCOL_VERSION } from './prompts.mjs';

export const DEFAULT_ENDPOINT = 'https://opencode.ai/inference/go/v1/chat/completions';
export const DEFAULT_MODEL = 'deepseek-v4.1-flash';
export const DEFAULT_REASONING_EFFORT = 'max';
export const DEFAULT_MAX_TOKENS = 16384;
export const DEFAULT_TIMEOUT_MS = 180_000;
export const HISTORY_TRANSMISSION_MODE =
  'tc5_aligned_two_system_headers_plus_assistant_content_and_reasoning_content';

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function readManagedCredentialFromDsh(refName = 'OPENCODE_GO_API_KEY') {
  const credPath = join(homedir(), '.dsh', '.credentials.yaml');
  if (!existsSync(credPath)) return null;
  try {
    const text = readFileSync(credPath, 'utf8');
    const escaped = refName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, 'm'));
    if (!match) return null;
    let raw = match[1].trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    return raw.length > 0 && !/[\r\n]/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function resolveClientConfig({
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  model = process.env.TC5B_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL,
  endpoint = process.env.TC5B_API_ENDPOINT ||
    process.env.OPENCODE_GO_ENDPOINT ||
    process.env.OPENAI_BASE_URL ||
    DEFAULT_ENDPOINT,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxTransportRetries = 2,
  retryDelayMs = 3000,
  requireCredential = false
} = {}) {
  const validEfforts = ['max', 'high', 'medium', 'low', 'none'];
  if (!validEfforts.includes(reasoningEffort)) {
    throw new Error(
      `Unsupported reasoningEffort "${reasoningEffort}". Expected one of: ${validEfforts.join(', ')}`
    );
  }

  let normalizedEndpoint = endpoint.trim();
  if (!normalizedEndpoint.endsWith('/chat/completions')) {
    normalizedEndpoint = normalizedEndpoint.replace(/\/+$/, '') + '/chat/completions';
  }

  const envKey =
    process.env.OPENCODE_GO_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    null;
  const dshKey = envKey ? null : readManagedCredentialFromDsh('OPENCODE_GO_API_KEY');
  const apiKey = envKey || dshKey;
  const credentialSource = envKey
    ? 'environment'
    : dshKey
      ? 'dsh-managed-credentials'
      : 'unavailable';

  if (requireCredential && !apiKey) {
    throw new Error(
      'API credential not found in environment (OPENCODE_GO_API_KEY / OPENAI_API_KEY) or ~/.dsh/.credentials.yaml'
    );
  }

  return {
    endpoint: normalizedEndpoint,
    model,
    reasoning_effort: reasoningEffort,
    max_tokens: maxTokens,
    timeout_ms: timeoutMs,
    max_transport_retries: maxTransportRetries,
    retry_delay_ms: retryDelayMs,
    history_transmission_mode: HISTORY_TRANSMISSION_MODE,
    credential_available: Boolean(apiKey),
    credential_source: credentialSource,
    getApiKey() {
      if (!apiKey) {
        throw new Error('API credential unavailable');
      }
      return apiKey;
    }
  };
}

export function buildTc5ChatRequestBody({
  model = DEFAULT_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  maxTokens = DEFAULT_MAX_TOKENS,
  systemPrompt,
  protocolVersion = PROTOCOL_VERSION,
  currentSourceId,
  sourceIds,
  conversationMessages,
  stream = true
}) {
  if (typeof systemPrompt !== 'string' || !systemPrompt.length) {
    throw new Error('systemPrompt must be a non-empty string');
  }
  if (!Array.isArray(conversationMessages) || conversationMessages.length === 0) {
    throw new Error('conversationMessages must be a non-empty array');
  }
  if (typeof currentSourceId !== 'string' || !Array.isArray(sourceIds)) {
    throw new Error('currentSourceId and sourceIds are required for TC5 protocol alignment');
  }

  const metadataHeader = JSON.stringify({
    acmi_request: {
      protocol: protocolVersion,
      current_source_id: currentSourceId
    },
    source_ids: sourceIds
  });

  const wireMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: metadataHeader },
    ...conversationMessages.map(m => {
      if (m.role === 'assistant') {
        if (typeof m.reasoning_content !== 'string') {
          throw new Error(`Assistant message ${m.source_id || ''} missing reasoning_content string`);
        }
        return {
          role: 'assistant',
          content: m.content,
          reasoning_content: m.reasoning_content
        };
      }
      return {
        role: 'user',
        content: m.content
      };
    })
  ];

  const thinkingFields =
    reasoningEffort === 'none'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'enabled' }, reasoning_effort: reasoningEffort };

  return {
    model,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    max_tokens: maxTokens,
    ...thinkingFields,
    messages: wireMessages
  };
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
    model,
    system_fingerprint,
    generation_id,
    finish_reason,
    usage,
    reasoning_content: reasoningParts.join(''),
    content: contentParts.join(''),
    done,
    event_count: eventCount
  };
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export async function invokeChatCompletion({
  config,
  task,
  rawDir,
  fetchImpl = fetch
}) {
  const apiKey = config.getApiKey();
  const requestBody = buildTc5ChatRequestBody({
    model: config.model,
    reasoningEffort: config.reasoning_effort,
    maxTokens: config.max_tokens,
    systemPrompt: task.system_prompt,
    protocolVersion: PROTOCOL_VERSION,
    currentSourceId: task.current_source_id,
    sourceIds: task.source_ids,
    conversationMessages: task.conversation_messages,
    stream: true
  });
  const requestBytes = Buffer.from(JSON.stringify(requestBody), 'utf8');
  const requestSha256 = sha256Hex(requestBytes);

  const attemptLogs = [];
  let transportRetries = 0;
  let finalResponse = null;
  const startedAtIso = new Date().toISOString();
  const overallStartMs = performance.now();

  const maxAttempts = 1 + (config.max_transport_retries ?? 2);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartIso = new Date().toISOString();
    const attemptStartMs = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout_ms);

    try {
      const response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'acmi-tc5-b/1.0',
          'x-opencode-session': `tc5b-${task.session_key || task.task_id}`,
          Authorization: `Bearer ${apiKey}`
        },
        body: requestBytes,
        signal: controller.signal,
        redirect: 'error'
      });

      const httpStatus = response.status;
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      const wireSha256 = sha256Hex(rawBuffer);
      const rawText = rawBuffer.toString('utf8');
      const attemptLatencyMs = performance.now() - attemptStartMs;

      if (httpStatus !== 200) {
        attemptLogs.push({
          attempt,
          started_at: attemptStartIso,
          completed_at: new Date().toISOString(),
          latency_ms: attemptLatencyMs,
          http_status: httpStatus,
          error: `http_${httpStatus}`,
          retryable: isRetryableStatus(httpStatus)
        });
        if (attempt < maxAttempts && isRetryableStatus(httpStatus)) {
          transportRetries++;
          await new Promise(r => setTimeout(r, config.retry_delay_ms * attempt));
          continue;
        }
        throw new Error(`HTTP ${httpStatus} on task ${task.task_id}`);
      }

      let parsedPayload;
      if (contentType.includes('text/event-stream') || rawText.trimStart().startsWith('data:')) {
        parsedPayload = parseSseTranscript(rawText);
      } else {
        const jsonObj = JSON.parse(rawText);
        const choice = jsonObj.choices?.[0] ?? {};
        const msg = choice.message ?? choice.delta ?? {};
        parsedPayload = {
          model: jsonObj.model ?? null,
          system_fingerprint: jsonObj.system_fingerprint ?? null,
          generation_id: jsonObj.id ?? null,
          finish_reason: choice.finish_reason ?? null,
          usage: jsonObj.usage ?? null,
          reasoning_content: msg.reasoning_content ?? '',
          content: msg.content ?? '',
          done: true,
          event_count: 1
        };
      }

      attemptLogs.push({
        attempt,
        started_at: attemptStartIso,
        completed_at: new Date().toISOString(),
        latency_ms: attemptLatencyMs,
        http_status: httpStatus,
        error: null
      });

      finalResponse = {
        http_status: httpStatus,
        content_type: contentType,
        model: parsedPayload.model,
        system_fingerprint: parsedPayload.system_fingerprint,
        generation_id: parsedPayload.generation_id,
        finish_reason: parsedPayload.finish_reason,
        usage: parsedPayload.usage,
        reasoning_content: parsedPayload.reasoning_content,
        content: parsedPayload.content,
        wire_bytes: rawBuffer.length,
        wire_sha256: wireSha256,
        event_count: parsedPayload.event_count,
        raw_wire_text: rawText
      };
      break;
    } catch (err) {
      const attemptLatencyMs = performance.now() - attemptStartMs;
      const isHttpNonRetryable = /^HTTP \d+ on task/.test(err.message);
      if (!isHttpNonRetryable) {
        attemptLogs.push({
          attempt,
          started_at: attemptStartIso,
          completed_at: new Date().toISOString(),
          latency_ms: attemptLatencyMs,
          http_status: null,
          error: err.name === 'AbortError' ? 'timeout' : err.message,
          retryable: true
        });
        if (attempt < maxAttempts) {
          transportRetries++;
          await new Promise(r => setTimeout(r, config.retry_delay_ms * attempt));
          continue;
        }
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const completedAtIso = new Date().toISOString();
  const totalLatencyMs = performance.now() - overallStartMs;

  const rawArtifact = {
    task_id: task.task_id,
    ordinal: task.ordinal,
    exp: task.exp,
    contract: task.contract,
    history_transmission_mode: HISTORY_TRANSMISSION_MODE,
    started_at: startedAtIso,
    completed_at: completedAtIso,
    latency_ms: totalLatencyMs,
    transport_retries: transportRetries,
    attempt_logs: attemptLogs,
    raw_request: {
      endpoint: config.endpoint,
      request_sha256: requestSha256,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'acmi-tc5-b/1.0',
        'x-opencode-session': `tc5b-${task.session_key || task.task_id}`,
        Authorization: 'Bearer [REDACTED]'
      },
      body: requestBody
    },
    raw_response: finalResponse
  };

  if (rawDir) {
    mkdirSync(rawDir, { recursive: true });
    const fileName = `${String(task.ordinal).padStart(2, '0')}-${task.task_id}.json`;
    writeFileSync(join(rawDir, fileName), JSON.stringify(rawArtifact, null, 2) + '\n', 'utf8');
  }

  return rawArtifact;
}
