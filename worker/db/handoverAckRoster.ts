import type { Env } from "../types";
import { HANDOVER_ALL_ACK_NAMES } from "../../shared/types";

// Lazily seeds a team's roster with the original hardcoded names the first
// time it's read — mirrors ensureDefaultTeam/ensurePublicEditor's "create
// the default row on first read" pattern elsewhere in this codebase,
// rather than a migration that would need to assume a specific team id.
export async function getHandoverAckRoster(db: Env["DB"], teamId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT position, name FROM handover_ack_roster WHERE team_id = ?1 ORDER BY position")
    .bind(teamId)
    .all<{ position: number; name: string }>();
  if (results && results.length === HANDOVER_ALL_ACK_NAMES.length) {
    return results.map((row) => row.name);
  }

  const defaults = [...HANDOVER_ALL_ACK_NAMES];
  for (let i = 0; i < defaults.length; i++) {
    await db
      .prepare(
        `INSERT INTO handover_ack_roster (team_id, position, name) VALUES (?1, ?2, ?3)
         ON CONFLICT (team_id, position) DO NOTHING`,
      )
      .bind(teamId, i + 1, defaults[i])
      .run();
  }
  return defaults;
}

// Renaming a slot also renames any existing acks recorded under its old
// name, so a team that already has notices with "Justin" checked doesn't
// lose that history just because they renamed the slot to "James".
export async function setHandoverAckRoster(db: Env["DB"], teamId: string, names: string[]): Promise<string[]> {
  const current = await getHandoverAckRoster(db, teamId);
  for (let i = 0; i < names.length; i++) {
    const oldName = current[i];
    const newName = names[i];
    await db
      .prepare("UPDATE handover_ack_roster SET name = ?1 WHERE team_id = ?2 AND position = ?3")
      .bind(newName, teamId, i + 1)
      .run();
    if (oldName !== undefined && oldName !== newName) {
      await db.prepare("UPDATE handover_notice_acks SET name = ?1 WHERE name = ?2").bind(newName, oldName).run();
    }
  }
  return names;
}
