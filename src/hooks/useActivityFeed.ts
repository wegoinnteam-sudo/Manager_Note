import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityFeedItemDTO } from "@shared/types";
import { api } from "@/lib/api";

const POLL_INTERVAL_MS = 20000;

/**
 * Feeds the "Wegoinn DB" bottom activity bar. Most visitors share one
 * "공용 편집자" login (see worker/middleware/session.ts), so `guestName` — the
 * display name typed locally in useGuestIdentity — is what actually
 * distinguishes "my own edit" from a teammate's, both for excluding your own
 * activity and for who "V" acks it for.
 *
 * The list of unacked entries is shared team-wide (server-side), but
 * dismissing one ("V") is per-guest — `dismissedRef` hides it locally the
 * instant it's clicked so a poll landing mid-request can't briefly
 * resurrect it, independent of whether the server ack has actually landed.
 */
export function useActivityFeed(guestName: string) {
  const [items, setItems] = useState<ActivityFeedItemDTO[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!guestName) return;
    const { items: rows } = await api.listActivityFeed(guestName);
    setItems(rows.filter((row) => !row.acked && !dismissedRef.current.has(row.id)));
  }, [guestName]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const ack = useCallback(async (id: string) => {
    dismissedRef.current.add(id);
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await api.ackActivity(id, guestName);
    } catch {
      dismissedRef.current.delete(id);
      await refresh();
    }
  }, [guestName, refresh]);

  const ackAll = useCallback(async () => {
    const ids = items.map((item) => item.id);
    if (ids.length === 0) return;
    ids.forEach((id) => dismissedRef.current.add(id));
    setItems([]);
    try {
      await api.ackAllActivity(guestName);
    } catch {
      ids.forEach((id) => dismissedRef.current.delete(id));
      await refresh();
    }
  }, [items, guestName, refresh]);

  return { items, ack, ackAll };
}
