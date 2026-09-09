import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityFeedItemDTO } from "@shared/types";
import { api } from "@/lib/api";

const POLL_INTERVAL_MS = 20000;

/**
 * Feeds the "Wegoinn DB" bottom activity bar. The list of unacked entries is
 * shared by the whole team (server-side), but dismissing one ("V") is a
 * per-user action — `dismissedRef` hides it locally the instant it's clicked
 * so a poll landing mid-request can't briefly resurrect it, independent of
 * whether the server ack has actually landed yet.
 */
export function useActivityFeed() {
  const [items, setItems] = useState<ActivityFeedItemDTO[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const { items: rows } = await api.listActivityFeed();
    setItems(rows.filter((row) => !row.acked && !dismissedRef.current.has(row.id)));
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const ack = useCallback(async (id: string) => {
    dismissedRef.current.add(id);
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await api.ackActivity(id);
    } catch {
      dismissedRef.current.delete(id);
      await refresh();
    }
  }, [refresh]);

  return { items, ack };
}
