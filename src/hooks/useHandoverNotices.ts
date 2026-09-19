import { useCallback, useEffect, useState } from "react";
import type { HandoverNoticeDTO } from "@shared/types";
import { api } from "@/lib/api";

// Polled (not just fetched once) so the "새로운 인수인계" badge in the sidebar
// stays live across devices/tabs on this shared reception board, mirroring
// useActivityFeed's polling for the same reason.
const POLL_INTERVAL_MS = 20000;

export function useHandoverNotices() {
  const [notices, setNotices] = useState<HandoverNoticeDTO[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { notices: rows } = await api.listHandoverNotices();
    setNotices(rows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { notices, loaded, refresh };
}
