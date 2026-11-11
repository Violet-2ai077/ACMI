import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const sha = value => createHash('sha256').update(value).digest('hex')

export function freezeInput(contract, requests, cfg) {
  assert.equal(contract.protocol, cfg.sourceProtocol)
  assert.equal(sha(contract.prompt), cfg.promptDigest, 'prompt digest changed')
  assert.equal(sha(JSON.stringify(contract.responseSchema)), cfg.schemaDigest, 'schema digest changed')
  assert(Array.isArray(requests) && requests.length === cfg.maxGenerations, 'wrong frozen request count')
  assert.equal(sha(JSON.stringify(requests)), cfg.requestsDigest, 'requests digest changed')
  const keys = new Set()
  const scheduled = requests.map(({ storyId, mode, requestDigest, payload }) => {
    const order = sha(JSON.stringify([storyId, mode]))
    assert(!keys.has(order) && ['off', 'on'].includes(mode), 'wrong request identity')
    keys.add(order)
    const { promptDigest, schemaDigest } = cfg
    assert.equal(sha(JSON.stringify({ promptDigest, schemaDigest, payload })), requestDigest, 'request digest changed')
    return { storyId, mode, requestDigest, payload, order }
  }).sort((a, b) => a.order < b.order ? -1 : 1)
  return { prompt: contract.prompt, schema: contract.responseSchema, requests: scheduled }
}

export function planTokens(lengths, cfg) {
  assert(lengths.length > 0 && lengths.length <= cfg.maxGenerations, 'generation count exceeds cap')
  assert(lengths.every(n => Number.isSafeInteger(n) && n > 0 && n <= cfg.maxPromptTokens), 'per-prompt cap exceeded')
  const promptTokens = lengths.reduce((a, b) => a + b, 0)
  const outputReserved = lengths.length * cfg.maxOutputTokens
  const maxTokens = promptTokens + outputReserved
  assert(maxTokens <= cfg.maxTotalTokens, 'total token cap exceeded')
  return { promptTokens, outputReserved, maxTokens }
}

export function validateNativeResult(data, promptTokens, maxOutput) {
  assert.equal(data?.tokens_evaluated, promptTokens, 'unexpected input token accounting')
  assert(Number.isSafeInteger(data.tokens_predicted) && data.tokens_predicted >= 0
    && data.tokens_predicted <= maxOutput, 'unexpected output token accounting')
  assert(typeof data.content === 'string' && ['eos', 'word', 'limit'].includes(data.stop_type), 'invalid runtime response envelope')
  return { raw: data.content, inputTokens: promptTokens, outputTokens: data.tokens_predicted, stopType: data.stop_type }
}
