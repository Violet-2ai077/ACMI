import { createHash } from 'node:crypto'

export const continuityDigest = (text: string): string => createHash('sha256').update(text).digest('hex')
