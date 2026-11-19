import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CancellationRecord } from "./types";

/** Free-cancellation records for /취소확인, loaded from /api/cancellations. */
export function useCancellations(): {
  records: CancellationRecord[];
  loaded: boolean;
  connected: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [records, setRecords] = useState<CancellationRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { records: next } = await api.listCancellations();
      setRecords(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소내역을 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { records, loaded, connected: !error, error, reload };
}
