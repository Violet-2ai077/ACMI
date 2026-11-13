import { request } from 'node:http'

export const MODEL_MAX_OUTPUT_TOKENS = 512
const responseLimit = 64 * 1024

export function validateCompletion(value) {
  const usage = value?.usage
  if (typeof value?.text !== 'string' || !value.text.trim() || Buffer.byteLength(value.text) > responseLimit) {
    throw new Error('Invalid model text response')
  }
  if (!usage || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 1 || usage.outputTokens > MODEL_MAX_OUTPUT_TOKENS
    || (usage.totalTokens !== undefined && usage.totalTokens !== usage.inputTokens + usage.outputTokens)) {
    throw new Error('Invalid model usage')
  }
  return { text: value.text, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens } }
}

function decode(body) {
  let value
  try { value = JSON.parse(body) } catch { throw new Error('Invalid model JSON response') }
  const choice = value?.choices?.[0], message = choice?.message
  if (!Array.isArray(value?.choices) || value.choices.length !== 1 || choice.finish_reason !== 'stop'
    || message?.role !== 'assistant' || message.tool_calls !== undefined || message.function_call !== undefined
    || (message.reasoning_content !== undefined && message.reasoning_content !== null && message.reasoning_content !== '')) {
    throw new Error('Invalid model text-only response')
  }
  return validateCompletion({ text: message.content, usage: { inputTokens: value.usage?.prompt_tokens,
    outputTokens: value.usage?.completion_tokens, totalTokens: value.usage?.total_tokens } })
}

export function createLoopbackCompletion({ endpoint, model, timeoutMs = 120_000, maxResponseBytes = responseLimit }) {
  let url
  try { url = new URL(endpoint) } catch { throw new Error('Invalid local model endpoint') }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/v1/chat/completions') throw new Error('Invalid local model endpoint')
  if (typeof model !== 'string' || !model.trim() || model.length > 256) throw new Error('Invalid local model name')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000
    || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > responseLimit) {
    throw new Error('Invalid model transport budget')
  }
  return async (messages, signal) => {
    signal?.throwIfAborted()
    if (!Array.isArray(messages) || messages.length !== 2 || messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
      || messages.some(m => typeof m.content !== 'string' || !m.content.trim() || Object.keys(m).some(k => !['role', 'content'].includes(k)))) {
      throw new Error('Invalid model request messages')
    }
    const body = JSON.stringify({ model, messages, max_tokens: MODEL_MAX_OUTPUT_TOKENS, temperature: 0,
      stream: false, cache_prompt: false })
    if (Buffer.byteLength(body) > 48 * 1024) throw new Error('Model request byte budget exceeded')
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error, result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(result)
      }
      // node:http connects directly: no proxy environment, redirects or retry machinery.
      const req = request(url, { method: 'POST', signal, agent: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        if (res.statusCode !== 200) {
          finish(new Error(`Local model HTTP status ${res.statusCode}`)); res.destroy(); return
        }
        if (!/^application\/json(?:\s*;|$)/iu.test(res.headers['content-type'] ?? '')) {
          finish(new Error('Invalid model response content type')); res.destroy(); return
        }
        const chunks = []
        let bytes = 0
        res.on('data', chunk => {
          bytes += chunk.length
          if (bytes > maxResponseBytes) { finish(new Error('Model response byte budget exceeded')); res.destroy() }
          else chunks.push(chunk)
        })
        res.on('error', () => finish(new Error('Local model response interrupted')))
        res.on('end', () => {
          if (settled) return
          try { finish(null, decode(Buffer.concat(chunks).toString('utf8'))) } catch (error) { finish(error) }
        })
      })
      const timer = setTimeout(() => { finish(new Error('Local model timeout')); req.destroy() }, timeoutMs)
      req.on('error', () => finish(signal?.aborted ? signal.reason : new Error('Local model request failed')))
      req.end(body)
    })
  }
}
