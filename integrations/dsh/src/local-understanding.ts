import type { GraphStreamCut, StoredRuntimeFact } from '@acmi/contracts'
import { proposeGraphChanges } from '@acmi/core'
import { continuityDigest } from './local-digest.ts'

export const analyzeTaskDelta = (cut: GraphStreamCut, facts: readonly StoredRuntimeFact[], suggestion?: unknown) =>
  proposeGraphChanges(cut, facts, continuityDigest, suggestion)
