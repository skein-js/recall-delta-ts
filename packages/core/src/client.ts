import type {
  AdvanceSessionRequest,
  Batch,
  Capabilities,
  CloseSessionRequest,
  Evidence,
  FeedbackReceipt,
  FeedbackRequest,
  ObserveReceipt,
  ObserveRequest,
  OpenSessionRequest,
  ReadDeltasRequest,
  ReadDeltasResult,
  ReadEvidenceRequest,
  ReadSessionRequest,
  Snapshot,
} from './contracts.js';

export type Awaitable<T> = T | Promise<T>;
/** The portable nine-operation client contract. Extensions are separate capabilities. */
export interface RecallDeltaClient {
  describe(): Awaitable<Capabilities>;
  observe(request: ObserveRequest): Awaitable<ObserveReceipt>;
  readEvidence(request: ReadEvidenceRequest): Awaitable<Evidence>;
  openSession(request: OpenSessionRequest): Awaitable<Snapshot>;
  advanceSession(request: AdvanceSessionRequest): Awaitable<Batch>;
  readSession(request: ReadSessionRequest): Awaitable<Snapshot>;
  readDeltas(request: ReadDeltasRequest): Awaitable<ReadDeltasResult>;
  recordFeedback(request: FeedbackRequest): Awaitable<FeedbackReceipt>;
  closeSession(request: CloseSessionRequest): Awaitable<Batch>;
}
/** Preserve synchronous reference-engine ergonomics without defining the portable contract from it. */
export type Synchronous<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Awaited<R> : never;
};
