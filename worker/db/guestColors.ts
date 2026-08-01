import type { Env } from "../types";
import { nowIso } from "../lib/ids";

export interface GuestColorRow {
  name: string;
  color: string;
}

export async function listGuestColors(db: Env["DB"], teamId: string): Promise<GuestColorRow[]> {
  const { results } = await db
    .prepare("SELECT name, color FROM guest_colors WHERE team_id = ?1")
    .bind(teamId)
    .all<GuestColorRow>();
  return results ?? [];
}

// Upserts the color for a display name, or deletes the row (reset to the
// deterministic default) when color is null. There is no real per-guest
// identity to authorize this against — same trust model as the guest name
// itself, which anyone can already type freely.
export async function setGuestColor(db: Env["DB"], teamId: string, name: string, color: string | null): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (color === null) {
    await db.prepare("DELETE FROM guest_colors WHERE team_id = ?1 AND name = ?2").bind(teamId, trimmed).run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO guest_colors (team_id, name, color, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (team_id, name) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at`,
    )
    .bind(teamId, trimmed, color, nowIso())
    .run();
}
