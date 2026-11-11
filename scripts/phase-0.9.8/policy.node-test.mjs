import assert from 'node:assert/strict'
import test from 'node:test'
import { planTokens, validateNativeResult, freezeInput, sha } from './policy.mjs'

test('the token plan reserves every completion before any inference', () => {
  const limits = { maxGenerations: 2, maxPromptTokens: 10, maxOutputTokens: 5, maxTotalTokens: 26 }
  assert.deepEqual(planTokens([8, 8], limits), { promptTokens: 16, outputReserved: 10, maxTokens: 26 })
  assert.throws(() => planTokens([8, 9], limits), /total token cap/u)
  assert.throws(() => planTokens([1, 11], limits), /per-prompt cap/u)
  assert.throws(() => planTokens([1, 1, 1], limits), /generation count/u)
})

test('the response must report the exact input token count and stay within the output cap', () => {
  const native = { content: '{}', tokens_evaluated: 30, tokens_predicted: 9, stop_type: 'eos' }
  assert.equal(validateNativeResult(native, 30, 10).outputTokens, 9)
  assert.throws(() => validateNativeResult(native, 31, 10), /token accounting/u)
  assert.throws(() => validateNativeResult(native, 30, 8), /token accounting/u)
})

test('request digests bind the frozen schema, prompt and inputs', () => {
  const prompt = 'Frozen prompt.', responseSchema = { type: 'object' }
  const promptDigest = sha(prompt), schemaDigest = sha(JSON.stringify(responseSchema))
  const payload = { current: { text: 'A' }, antecedent: null, candidates: [], binding: null }
  const requestDigest = sha(JSON.stringify({ promptDigest, schemaDigest, payload }))
  const requests = [{ storyId: 'a', mode: 'off', requestDigest, payload }]
  const cfg = { sourceProtocol: 'p', promptDigest, schemaDigest, maxGenerations: 1,
    requestsDigest: sha(JSON.stringify(requests)) }
  const contract = { protocol: 'p', prompt, responseSchema }
  assert.equal(freezeInput(contract, requests, cfg).requests[0].requestDigest, requestDigest)
  assert.throws(() => freezeInput({ ...contract, prompt: 'changed' }, requests, cfg), /prompt digest/u)
  assert.throws(() => freezeInput(contract, [{ ...requests[0], mode: 'on' }], cfg), /requests digest/u)
})
