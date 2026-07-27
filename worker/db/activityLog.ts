import type { Env } from "../types";
import { newId } from "../lib/ids";

export async function logActivity(
  db: Env["DB"],
  params: { teamId: string; pageId: string | null; actorId: string | null; action: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO activity_logs (id, team_id, page_id, actor_id, action, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(newId("log"), params.teamId, params.pageId, params.actorId, params.action, JSON.stringify(params.metadata ?? {}))
    .run();
}

export interface ActivityLogRow {
  id: string;
  team_id: string;
  page_id: string | null;
  actor_id: string | null;
  action: string;
  metadata_json: string;
  created_at: string;
}

export async function listActivityForPage(db: Env["DB"], pageId: string, limit = 50): Promise<ActivityLogRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM activity_logs WHERE page_id = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(pageId, limit)
    .all<ActivityLogRow>();
  return results ?? [];
}
