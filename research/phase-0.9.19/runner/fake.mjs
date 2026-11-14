import { setTimeout as delay } from 'node:timers/promises'
const registered = new WeakSet()
export const isFakeTransport = t => registered.has(t)
export function makeFakeTransport(script) {
  const steps = structuredClone(script), requests = []
  const transport = Object.freeze({
    kind: 'fake',
    calls: () => requests.length,
    requests: () => structuredClone(requests),
    async *generate(request, { signal } = {}) {
      const step = steps[requests.length]
      requests.push(structuredClone(request))
      if (!step) throw new Error('fake script exhausted')
      if (step.delayMs) await delay(step.delayMs, undefined, { signal })
      const raw = Buffer.from(step.raw ?? '')
      const size = step.chunkSize ?? 97
      if (!Number.isInteger(size) || size <= 0) throw new Error('chunk size')
      for (let at = 0; at < raw.length; at += size) {
        if (signal?.aborted) throw new Error('aborted')
        yield { bytes: raw.subarray(at, at + size) }
      }
      if (step.error) throw new Error(step.error)
      yield { finish_reason: step.finish_reason ?? 'stop', usage: step.usage ?? null }
    }
  })
  registered.add(transport)
  return transport
}
