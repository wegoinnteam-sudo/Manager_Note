import type { PresenceUser } from "@/hooks/usePresence";
import { caretPixelPosition } from "./caretPosition";

/** Precise per-character cursor markers, shown only while the local viewer
 * also has this exact block's textarea mounted (so there's a real element
 * to measure against). */
export function RemoteCaretMarkers({ textarea, users }: { textarea: HTMLTextAreaElement | null; users: PresenceUser[] }) {
  if (!textarea || users.length === 0) return null;
  return (
    <>
      {users.map((u) => {
        const pos = caretPixelPosition(textarea, u.offset);
        return (
          <span
            key={u.clientId}
            className="remote-caret"
            style={{ top: pos.top, left: pos.left, height: pos.height, background: u.color }}
          >
            <span className="remote-caret__label" style={{ background: u.color }}>
              {u.animal} {u.name}
            </span>
          </span>
        );
      })}
    </>
  );
}

/** Lightweight fallback badge for blocks the local viewer doesn't have open
 * as a textarea right now — no precise position to measure against. */
export function RemotePresenceBadge({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;
  return (
    <span className="remote-presence-badge" title={users.map((u) => u.name).join(", ")}>
      {users.slice(0, 3).map((u) => (
        <span key={u.clientId} className="remote-presence-badge__animal" style={{ borderColor: u.color }}>
          {u.animal}
        </span>
      ))}
      {users.length === 1 ? `${users[0].name} 편집 중` : `${users.length}명 편집 중`}
    </span>
  );
}
