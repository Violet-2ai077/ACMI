export { apply, assertDshVersion, Config, inject, name, type AcmiHistory, type HistoryRequest } from './plugin.ts'
export {
  createDshHarnessAdapter, createDshJournalHarnessAdapter, dshCapabilities, dshJournalCapabilities, dshSessionRef,
  normalizeDshCut, DSH_VERSION, type DshHarnessSource, type DshSessionCut,
} from './harness.ts'
export { ScopedJournalError, type DshJournalInspection, type JsonlCompression, type ScopedJournalLimits } from './journal-format.ts'
export { openDshJournal, type DshJournal, type DshJournalSnapshot } from './scoped-read.ts'
export { createDshStorageAdapter, type DshStorageSource } from './storage.ts'
export { createStorageIsolationMarker } from './storage-isolation.ts'
export { registerSyntheticTaskRecovery, type SyntheticTaskRecoveryOptions, type SyntheticTaskRecoveryRegistration } from './recovery-context.ts'
