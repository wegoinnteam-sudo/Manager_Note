/** One approved free-cancellation record shown on /취소확인. */
export interface CancellationRecord {
  id: string;
  /** YYYY-MM-DD */
  cancelDate: string;
  reservationNumber: string;
  guestName: string;
  /** YYYY-MM-DD */
  checkInDate: string;
  /** Refunded share in percent — 100 means a full (100%) cancellation, anything lower is partial. */
  cancellationRate: number;
  manager: string;
  reason: string;
  /** Local date-time, "YYYY-MM-DDTHH:mm" (seconds/zone optional). */
  createdAt: string;
}

export type RateFilter = "all" | "full" | "partial";

export type SortKey = "cancelDate" | "checkInDate" | "cancellationRate" | "createdAt";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export interface CancellationFilters {
  from: string;
  to: string;
  manager: string;
  rate: RateFilter;
  query: string;
}
