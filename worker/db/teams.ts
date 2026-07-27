import type { Env, Role } from "../types";
import { newId, nowIso } from "../lib/ids";

export const DEFAULT_TEAM_ID = "team_default";

export interface TeamRow {
  id: string;
  name: string;
  drive_folder_id: string | null;
  drive_shared_drive_id: string | null;
  drive_inbox_page_id: string | null;
}

/**
 * MVP is single-team: this lazily creates the one workspace team row so the
 * schema is ready for multi-team later without forcing a team picker UI now.
 */
export async function ensureDefaultTeam(db: Env["DB"], env: Env): Promise<TeamRow> {
  const existing = await db
    .prepare(
      "SELECT id, name, drive_folder_id, drive_shared_drive_id, drive_inbox_page_id FROM teams WHERE id = ?1",
    )
    .bind(DEFAULT_TEAM_ID)
    .first<TeamRow>();
  if (existing) return existing;

  await db
    .prepare(
      "INSERT INTO teams (id, name, drive_folder_id, drive_shared_drive_id) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(DEFAULT_TEAM_ID, "팀 인수인계 노트", env.GOOGLE_DRIVE_FOLDER_ID || null, env.GOOGLE_DRIVE_SHARED_DRIVE_ID || null)
    .run();

  return {
    id: DEFAULT_TEAM_ID,
    name: "팀 인수인계 노트",
    drive_folder_id: env.GOOGLE_DRIVE_FOLDER_ID || null,
    drive_shared_drive_id: env.GOOGLE_DRIVE_SHARED_DRIVE_ID || null,
    drive_inbox_page_id: null,
  };
}

export async function getTeamById(db: Env["DB"], teamId: string): Promise<TeamRow | null> {
  const row = await db
    .prepare("SELECT id, name, drive_folder_id, drive_shared_drive_id, drive_inbox_page_id FROM teams WHERE id = ?1")
    .bind(teamId)
    .first<TeamRow>();
  return row ?? null;
}

export async function ensureTeamMembership(
  db: Env["DB"],
  teamId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM team_members WHERE team_id = ?1 AND user_id = ?2")
    .bind(teamId, userId)
    .first<{ id: string }>();
  if (existing) return;
  await db
    .prepare("INSERT INTO team_members (id, team_id, user_id, role) VALUES (?1, ?2, ?3, ?4)")
    .bind(newId("member"), teamId, userId, role)
    .run();
}

export async function setDriveInboxPageId(db: Env["DB"], teamId: string, pageId: string): Promise<void> {
  await db
    .prepare("UPDATE teams SET drive_inbox_page_id = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(pageId, nowIso(), teamId)
    .run();
}
