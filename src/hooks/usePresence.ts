import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestIdentity } from "./useGuestIdentity";

export interface PresenceUser {
  clientId: string;
  name: string;
  color: string;
  pageId: string | null;
  blockId: string | null;
  offset: number;
}

/**
 * One WebSocket connection for the whole app session (not per-page), so
 * switching pages doesn't reconnect. Reports {pageId, blockId, offset}
 * whenever the caller calls `report`, and exposes every other connected
 * user's latest reported position.
 */
export function usePresence(identity: GuestIdentity | null) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const lastRef = useRef<{ pageId: string | null; blockId: string | null; offset: number }>({ pageId: null, blockId: null, offset: 0 });

  useEffect(() => {
    if (!identity) return;

    let cancelled = false;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/presence`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (cancelled) return;
      ws.send(JSON.stringify({ type: "join", clientId: identity.clientId, name: identity.name, color: identity.color }));
      const last = lastRef.current;
      if (last.pageId) ws.send(JSON.stringify({ type: "update", ...last }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "presence" && Array.isArray(msg.users)) {
          setUsers(msg.users.filter((u: PresenceUser) => u.clientId !== identity.clientId));
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    return () => {
      cancelled = true;
      wsRef.current = null;
      ws.close();
    };
  }, [identity]);

  const report = useCallback((pageId: string | null, blockId: string | null, offset: number) => {
    lastRef.current = { pageId, blockId, offset };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "update", pageId, blockId, offset }));
    }
  }, []);

  return { users, report };
}
