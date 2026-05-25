/**
 * OfflineSubmitQueue port — web ADR-0009 / ADR-0011 / FW-0044.
 *
 * Persists submission handoffs that could not be sent synchronously (typically
 * because the device is offline) and drains them when connectivity returns,
 * preserving the original UUIDv7 idempotency key so the server's same-key
 * contract suppresses duplicates.
 *
 * Separation from `SubmitTransport` (FW-0044 §"Decision on port shape"):
 *   - `SubmitTransport.submit(handoff, key)` is the synchronous request/response
 *     path. Idempotency-key generation is the caller's concern.
 *   - `OfflineSubmitQueue.enqueue / replay / pending` model durable queue
 *     lifecycle. The queue stores submissions across the network gap and the
 *     `SubmitTransport` injected at adapter construction time is what `replay`
 *     drains through. The two ports are wired as a unit at composition time
 *     (mirroring FW-0064's HTTP adapter cohort discipline) so adopters compose
 *     queue + transport pairs deliberately, not via runtime decoration.
 *
 * Conformance contract — the executable shape lives in
 * `defineOfflineSubmitQueueConformance` in `src/adapter-conformance/conformance.ts`;
 * adopters MUST run that suite against their adapter. The contract families
 * the suite covers (count tracks the suite, not this comment):
 *
 * - UUIDv7 idempotency keys — `enqueue` rejects non-UUIDv7 values (queue
 *   EXT-14 convention, mirrors `SubmitTransport.submit`).
 * - Enqueue idempotency — calling `enqueue(handoff, key)` twice with the same
 *   key returns the SAME `QueuedSubmit` and `pending()` length stays 1. The
 *   second handoff value is ignored (first-wins).
 * - Replay preserves the original idempotency key — the key passed to the
 *   injected `SubmitTransport.submit` MUST equal the key originally enqueued.
 *   This is the load-bearing duplicate-suppression invariant.
 * - FIFO replay order — `replay()` drains entries in enqueue order.
 * - Per-entry outcomes — `replay()` returns a `ReplayOutcome[]` of the same
 *   length as the pre-drain pending set; `'sent'` outcomes remove the entry,
 *   `'failed'` outcomes keep it pending for the next replay.
 * - Empty replay is a no-throw no-op — `replay()` on an empty queue resolves
 *   to `[]` without error.
 * - `pending()` accuracy — returns the currently-pending set, never includes
 *   sent entries, never includes entries that were rejected at enqueue.
 *
 * Slice-1 production posture: NO production reference adapter ships. The OSS
 * reference deployment wires `unavailableOfflineSubmitQueue()` + declares
 * `offlineSubmit: 'unavailable'`. Adopters who want offline support fork the
 * composition file and wire their own queue substrate (IndexedDB, OPFS,
 * service-worker-backed). See `docs/ports/offline-submit-queue.md`.
 */

import type {
  IntakeHandoff,
  SubmitConfirmation,
} from './submit-transport.ts';

export type { IntakeHandoff, SubmitTransport } from './submit-transport.ts';

export interface QueuedSubmit {
  /**
   * The original UUIDv7 idempotency key supplied at enqueue. MUST be reused
   * verbatim at replay so the server's idempotency contract honors the
   * "same key returns same response" guarantee. This is the load-bearing
   * duplicate-suppression invariant.
   */
  readonly idempotencyKey: string;
  /**
   * The submission handoff captured at enqueue time. The queue stores the
   * shape verbatim; the adapter is responsible for at-rest persistence
   * (in-memory in the stub; IndexedDB/OPFS/etc. in adopter forks).
   */
  readonly handoff: IntakeHandoff;
  /**
   * ISO-8601 wall clock at enqueue. Used for adopter-side display ("queued
   * 3 minutes ago"); never load-bearing for the queue's correctness.
   */
  readonly enqueuedAt: string;
}

export type ReplayOutcome =
  | {
      readonly kind: 'sent';
      readonly idempotencyKey: string;
      readonly confirmation: SubmitConfirmation;
    }
  | {
      readonly kind: 'failed';
      readonly idempotencyKey: string;
      readonly error: unknown;
    };

export interface OfflineSubmitQueue {
  /**
   * Enqueue a handoff for later submission. Idempotent: calling with the
   * same idempotencyKey twice MUST return the SAME `QueuedSubmit` and MUST
   * NOT enqueue a second entry. `idempotencyKey` MUST be a UUIDv7 string
   * (queue EXT-14 convention); adapters MUST reject non-UUIDv7 values with
   * an `Error` (same shape as `SubmitTransport.submit`).
   */
  enqueue(handoff: IntakeHandoff, idempotencyKey: string): Promise<QueuedSubmit>;

  /**
   * Drain the queue by submitting each pending entry through the injected
   * `SubmitTransport`, preserving each entry's original idempotencyKey.
   * Returns an outcome per drained entry in enqueue order (FIFO).
   * Successfully-sent entries are removed from the pending set; failed
   * entries remain pending for the next replay. An empty queue resolves
   * to `[]` without error.
   */
  replay(): Promise<readonly ReplayOutcome[]>;

  /**
   * Snapshot of the currently-pending entries. The React shell consumes this
   * for the "still waiting to send" panel; future diagnostic surfaces
   * (developer-view inspector) consume it too. Returns `[]` when nothing is
   * queued.
   */
  pending(): Promise<readonly QueuedSubmit[]>;
}
