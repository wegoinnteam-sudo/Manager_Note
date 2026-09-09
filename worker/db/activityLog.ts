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

// Actions surfaced in the "Wegoinn DB" bottom activity bar — real edits
// someone else might want to be notified about. Reorders (orderKey/parentId
// only) and comment/question chatter are deliberately excluded as noise.
const FEED_ACTIONS = ["page.created", "content.updated", "page.updated", "status.changed", "attachment.uploaded"];

export interface ActivityFeedRow extends ActivityLogRow {
  acked: number;
}

export async function listActivityFeed(db: Env["DB"], teamId: string, userId: string, limit = 100): Promise<ActivityFeedRow[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, CASE WHEN k.user_id IS NULL THEN 0 ELSE 1 END AS acked
       FROM activity_logs a
       LEFT JOIN activity_acks k ON k.activity_id = a.id AND k.user_id = ?1
       WHERE a.team_id = ?2
         AND a.page_id IS NOT NULL
         AND a.actor_id IS NOT NULL
         AND a.actor_id != ?1
         AND a.action IN (?3, ?4, ?5, ?6, ?7)
       ORDER BY a.created_at DESC
       LIMIT ?8`,
    )
    .bind(userId, teamId, ...FEED_ACTIONS, limit)
    .all<ActivityFeedRow>();
  return results ?? [];
}

/** Returns false if the activity doesn't exist (or belongs to another team), so the route can 404. */
export async function ackActivity(db: Env["DB"], params: { activityId: string; teamId: string; userId: string }): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM activity_logs WHERE id = ?1 AND team_id = ?2")
    .bind(params.activityId, params.teamId)
    .first<{ id: string }>();
  if (!row) return false;

  await db
    .prepare("INSERT INTO activity_acks (activity_id, user_id) VALUES (?1, ?2) ON CONFLICT(activity_id, user_id) DO NOTHING")
    .bind(params.activityId, params.userId)
    .run();
  return true;
}

/** "전체 확인": acks every feed entry currently unacked by this user, not just the ones the client has fetched (limit-capped) so nothing is left dangling. */
export async function ackAllActivity(db: Env["DB"], teamId: string, userId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activity_acks (activity_id, user_id)
       SELECT a.id, ?1
       FROM activity_logs a
       WHERE a.team_id = ?2
         AND a.page_id IS NOT NULL
         AND a.actor_id IS NOT NULL
         AND a.actor_id != ?1
         AND a.action IN (?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(activity_id, user_id) DO NOTHING`,
    )
    .bind(userId, teamId, ...FEED_ACTIONS)
    .run();
}
