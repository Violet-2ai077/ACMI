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
export { acquireContinuationRoots, provisionContinuationRoots, type ContinuationRootLease } from './continuation-lock.ts'
export type { ContinuationRoots } from './continuation-layout.ts'
export type { ContinuationModelContext, ContinuationContextSource } from './continuation-context.ts'
export { openContinuationHost, type ContinuationAccess, type ContinuationCloseResult, type ContinuationCommand, type ContinuationHistory,
  type ContinuationHistoryEvent, type ContinuationHost, type ContinuationHostOptions, type ContinuationPreview, type ContinuationPreviewToken,
  type ContinuationRuntime, type ContinuationStatus, type ContinuationTask } from './continuation-host.ts'
export type { ContinuationRegistration, ContinuationTaskCursor, ContinuationTaskPage, ContinuationTaskSummary } from './continuation-catalog.ts'
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
export type { QualificationSourceCommand } from './qualification-store.ts'
export { qualificationOutputSchema, RetryableQualificationError, runQualificationEvaluation } from './qualification-evaluation.ts'
export type { QualificationAdapter, QualificationEvaluation, QualificationEvalOptions, QualificationHostInput,
  QualificationMode, QualificationPacket, QualificationTurn, QualificationUsage } from './qualification-evaluation.ts'
export { offlineQualificationAdapter } from './qualification-mocks.ts'
export { runDshQualificationShadow, type DshQualificationShadowOptions } from './qualification-shadow.ts'
export { createDshLayeredShadow, type DshLayeredShadowInput, type DshLayeredShadowOptions, type DshLayeredShadowResult } from './layered-shadow.ts'
export { registerDshIdentityAdvice, type DshIdentityAdviceBridge, type DshIdentityAdviceCatalog,
  type DshIdentityAdviceOptions, type DshIdentityAdviceRequest, type DshIdentityPrior } from './identity-advice.ts'
export type { TaskLifecycleHostOptions, TaskLifecycleHost, TaskLifecycleCommand, TaskLifecycleConfirmation, TaskLifecycleReceipt,
  TaskLifecycleState } from './task-lifecycle.ts'
