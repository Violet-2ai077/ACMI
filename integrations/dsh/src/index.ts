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
export { dshRuntimeIdentity, normalizeDshRuntimeFact, runtimeFactAdapterVersion } from './runtime-facts.ts'
export { GraphStoreError, provisionGraphRoot } from './graph-store-db.ts'
export { LocalGraphStore, openGraphStore } from './graph-store.ts'
export type { GraphStoreOptions, RuntimeWorkAssignment } from './graph-store.ts'
export type { GraphAppendReceipt } from '@acmi/contracts'
export { analyzeTaskDelta } from './local-understanding.ts'
export { reconcileKnownDshSession, registerDshRuntimeIngestion, type DshIngestionOptions } from './runtime-ingestion.ts'
export { startDshIngestionSupervisor, type DshSupervisorOptions } from './ingestion-supervisor.ts'
export { registerPersistentDshRecovery, type PersistentRecoveryOptions, type ContextSnapshotIdentity } from './persistent-context.ts'
export { registerDshSnapshotGuard, type DshSnapshotGuard, type SnapshotReservation } from './snapshot-guard.ts'
export type { UnderstandingInboxItem, UnderstandingRequest, UnderstandingReviewCommand, UnderstandingTarget } from './understanding-host.ts'
export { createScriptedUnderstandingMock, startUnderstandingRuntime,
  type DshUnderstandingOptions, type UnderstandingRuntimeOptions } from './understanding-runtime.ts'
