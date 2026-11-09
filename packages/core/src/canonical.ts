export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']'
  if (typeof value !== 'object' || value === null || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Expected JSON data')
  }
  return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
}

export function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export const clone = <T>(value: T): T => JSON.parse(canonical(value)) as T
