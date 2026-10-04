import type { CancellationRecord } from "./types";

/**
 * Real free-cancellation records for /취소확인.
 *
 * There is no D1 table or /api endpoint for these yet, so this returns an
 * empty, "not connected" result and the board shows its empty state. When a
 * backend exists, fetch it here (e.g. `api.listCancellations()`) and keep
 * the return shape — CancellationBoard needs no other change.
 */
export function useCancellations(): { records: CancellationRecord[]; loaded: boolean; connected: boolean } {
  return { records: EMPTY, loaded: true, connected: false };
}

const EMPTY: CancellationRecord[] = [];
