// UI preview data ONLY. Never persisted, never merged with real records —
// CancellationBoard shows it only while the "샘플로 미리보기" toggle is on.
import type { CancellationRecord } from "./types";

export const MOCK_CANCELLATIONS: CancellationRecord[] = [
  {
    id: "sample-1",
    cancelDate: "2026-09-01",
    reservationNumber: "202807035",
    guestName: "Fung Yee",
    checkInDate: "2026-09-10",
    cancellationRate: 100,
    manager: "Daniel",
    reason: "-",
    createdAt: "2026-09-01T14:23",
  },
  {
    id: "sample-2",
    cancelDate: "2026-09-02",
    reservationNumber: "104159048",
    guestName: "Jade Du",
    checkInDate: "2026-08-28",
    cancellationRate: 100,
    manager: "Been",
    reason: "체크인 3일 전 취소",
    createdAt: "2026-09-02T09:15",
  },
];
