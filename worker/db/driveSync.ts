import type { Env } from "../types";
import { newId, nowIso } from "../lib/ids";

export interface DriveSyncStateRow {
  team_id: string;
  last_synced_at: string | null;
  last_page_token: string | null;
  status: "idle" | "running" | "failed";
  updated_at: string;
}

export async function getSyncState(db: Env["DB"], teamId: string): Promise<DriveSyncStateRow | null> {
  const row = await db.prepare("SELECT * FROM drive_sync_state WHERE team_id = ?1").bind(teamId).first<DriveSyncStateRow>();
  return row ?? null;
}

export async function upsertSyncState(
  db: Env["DB"],
  teamId: string,
  patch: Partial<Pick<DriveSyncStateRow, "last_synced_at" | "last_page_token" | "status">>,
): Promise<void> {
  const existing = await getSyncState(db, teamId);
  const now = nowIso();
  if (!existing) {
    await db
      .prepare(
        "INSERT INTO drive_sync_state (team_id, last_synced_at, last_page_token, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .bind(teamId, patch.last_synced_at ?? null, patch.last_page_token ?? null, patch.status ?? "idle", now)
      .run();
    return;
  }
  await db
    .prepare(
      "UPDATE drive_sync_state SET last_synced_at = ?1, last_page_token = ?2, status = ?3, updated_at = ?4 WHERE team_id = ?5",
    )
    .bind(
      patch.last_synced_at ?? existing.last_synced_at,
      patch.last_page_token ?? existing.last_page_token,
      patch.status ?? existing.status,
      now,
      teamId,
    )
    .run();
}

export interface DriveSyncLogRow {
  id: string;
  team_id: string;
  trigger: "manual" | "cron";
  status: "success" | "failed" | "partial";
  files_added: number;
  files_updated: number;
  files_skipped: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function createSyncLog(db: Env["DB"], teamId: string, trigger: "manual" | "cron"): Promise<string> {
  const id = newId("synclog");
  await db
    .prepare("INSERT INTO drive_sync_logs (id, team_id, trigger, status, started_at) VALUES (?1, ?2, ?3, 'success', ?4)")
    .bind(id, teamId, trigger, nowIso())
    .run();
  return id;
}

export async function finishSyncLog(
  db: Env["DB"],
  id: string,
  result: { status: "success" | "failed" | "partial"; filesAdded: number; filesUpdated: number; filesSkipped: number; errorMessage: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE drive_sync_logs SET status = ?1, files_added = ?2, files_updated = ?3, files_skipped = ?4,
       error_message = ?5, finished_at = ?6 WHERE id = ?7`,
    )
    .bind(result.status, result.filesAdded, result.filesUpdated, result.filesSkipped, result.errorMessage, nowIso(), id)
    .run();
}

export async function listSyncLogs(db: Env["DB"], teamId: string, limit = 20): Promise<DriveSyncLogRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM drive_sync_logs WHERE team_id = ?1 ORDER BY started_at DESC LIMIT ?2")
    .bind(teamId, limit)
    .all<DriveSyncLogRow>();
  return results ?? [];
}
