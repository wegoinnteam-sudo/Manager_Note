import type { CancellationFilters, CancellationRecord, SortState } from "./types";

export const CANCELLATION_PATH = "/취소확인";

export const EMPTY_FILTERS: CancellationFilters = { from: "", to: "", manager: "", rate: "all", query: "" };

/** location.pathname is percent-encoded for non-ASCII routes; compare decoded. */
export function isCancellationPath(path: string): boolean {
  try {
    return decodeURIComponent(path) === CANCELLATION_PATH;
  } catch {
    return false;
  }
}

export const isFullCancellation = (record: CancellationRecord) => record.cancellationRate >= 100;

export function rateLabel(record: CancellationRecord): string {
  return isFullCancellation(record) ? "100%" : `부분취소 ${record.cancellationRate}%`;
}

/** "2026-09-01T14:23:00" → "2026-09-01 14:23" */
export function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export function filterCancellations(records: CancellationRecord[], filters: CancellationFilters): CancellationRecord[] {
  const query = filters.query.trim().toLowerCase();
  return records.filter((record) => {
    if (filters.from && record.cancelDate < filters.from) return false;
    if (filters.to && record.cancelDate > filters.to) return false;
    if (filters.manager && record.manager !== filters.manager) return false;
    if (filters.rate === "full" && !isFullCancellation(record)) return false;
    if (filters.rate === "partial" && isFullCancellation(record)) return false;
    if (query) {
      const haystack = `${record.reservationNumber} ${record.guestName}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function sortCancellations(records: CancellationRecord[], sort: SortState): CancellationRecord[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const diff = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    // Stable tie-break on registration time so equal keys don't jump around.
    return diff !== 0 ? diff * sign : b.createdAt.localeCompare(a.createdAt);
  });
}

export function summarize(records: CancellationRecord[]) {
  const managers = new Set(records.map((r) => r.manager).filter(Boolean));
  const latest = records.reduce<string | null>((max, r) => (max === null || r.cancelDate > max ? r.cancelDate : max), null);
  return {
    total: records.length,
    full: records.filter(isFullCancellation).length,
    managerCount: managers.size,
    latestCancelDate: latest,
  };
}

export function managerNames(records: CancellationRecord[]): string[] {
  return [...new Set(records.map((r) => r.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Soft pastel pairs; a manager's badge color is picked deterministically from
// their name, so new managers get a color without any code change.
const MANAGER_PALETTE: Array<{ background: string; text: string }> = [
  { background: "#e8f0fe", text: "#1d4ed8" },
  { background: "#e7f6ef", text: "#047857" },
  { background: "#f3ecfd", text: "#6d28d9" },
  { background: "#fdf0e6", text: "#b45309" },
  { background: "#e6f6f9", text: "#0e7490" },
  { background: "#fcebf3", text: "#be185d" },
  { background: "#eef2e3", text: "#4d7c0f" },
  { background: "#eceefe", text: "#4338ca" },
];

export function managerColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return MANAGER_PALETTE[hash % MANAGER_PALETTE.length];
}

export function toExportRows(records: CancellationRecord[]) {
  return records.map((r, index) => ({
    "No.": index + 1,
    취소날짜: r.cancelDate,
    예약번호: r.reservationNumber,
    성함: r.guestName,
    "체크인 날짜": r.checkInDate,
    취소율: rateLabel(r),
    담당자: r.manager,
    사유: r.reason,
    등록일: formatDateTime(r.createdAt),
  }));
}
