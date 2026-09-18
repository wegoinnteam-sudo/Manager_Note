import type { Env } from "../types";
import { newId } from "../lib/ids";

export async function logActivity(
  db: Env["DB"],
  params: {
    teamId: string;
    pageId: string | null;
    actorId: string | null;
    action: string;
    metadata?: Record<string, unknown>;
    // The display name the visitor typed locally (useGuestIdentity). Most
    // visitors share one "공용 편집자" login (see worker/middleware/session.ts),
    // so actorId alone usually can't tell two real people apart — this is
    // what listActivityFeed/ackActivity actually key "who is this" on.
    actorName?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO activity_logs (id, team_id, page_id, actor_id, actor_name, action, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(
      newId("log"),
      params.teamId,
      params.pageId,
      params.actorId,
      params.actorName?.trim() || null,
      params.action,
      JSON.stringify(params.metadata ?? {}),
    )
    .run();
}

export interface ActivityLogRow {
  id: string;
  team_id: string;
  page_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
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

// "Is this row the viewer's own edit?" Prefer the guest name (reliable even
// under the shared login); fall back to actor_id only for rows logged
// before actor_name existed, or if a caller somehow didn't send one.
const NOT_SELF_CLAUSE = `
  NOT (
    (a.actor_name IS NOT NULL AND a.actor_name = ?1)
    OR (a.actor_name IS NULL AND a.actor_id = ?2)
  )
`;

export interface ActivityFeedRow extends ActivityLogRow {
  acked: number;
}

export async function listActivityFeed(
  db: Env["DB"],
  teamId: string,
  viewer: { userId: string; guestName: string },
  limit = 100,
): Promise<ActivityFeedRow[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, CASE WHEN k.guest_name IS NULL THEN 0 ELSE 1 END AS acked
       FROM activity_logs a
       LEFT JOIN activity_acks k ON k.activity_id = a.id AND k.guest_name = ?1
       WHERE a.team_id = ?3
         AND a.page_id IS NOT NULL
         AND a.actor_id IS NOT NULL
         AND k.guest_name IS NULL
         AND ${NOT_SELF_CLAUSE}
         AND a.action IN (?4, ?5, ?6, ?7, ?8)
       ORDER BY a.created_at DESC
       LIMIT ?9`,
    )
    .bind(viewer.guestName, viewer.userId, teamId, ...FEED_ACTIONS, limit)
    .all<ActivityFeedRow>();

  // Every save creates its own row (one per PATCH), so a page edited several
  // times before anyone acks piles up as that many "process" entries here.
  // Collapse those down to just the newest per page — the viewer wants to
  // see what changed since they last looked, not each intermediate save.
  const seenPages = new Set<string>();
  const deduped: ActivityFeedRow[] = [];
  for (const row of results ?? []) {
    if (row.page_id) {
      if (seenPages.has(row.page_id)) continue;
      seenPages.add(row.page_id);
    }
    deduped.push(row);
  }
  return deduped;
}

/** Returns false if the activity doesn't exist (or belongs to another team), so the route can 404. */
export async function ackActivity(
  db: Env["DB"],
  params: { activityId: string; teamId: string; guestName: string },
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id, page_id FROM activity_logs WHERE id = ?1 AND team_id = ?2")
    .bind(params.activityId, params.teamId)
    .first<{ id: string; page_id: string | null }>();
  if (!row) return false;

  // The feed only ever shows the newest row per page (listActivityFeed
  // collapses the rest as "process"), so acking it should close out every
  // earlier still-unacked edit to that same page too — otherwise the next
  // refresh would resurface one of those collapsed rows as if it were new.
  if (row.page_id) {
    await db
      .prepare(
        `INSERT INTO activity_acks (activity_id, guest_name)
         SELECT a.id, ?1
         FROM activity_logs a
         WHERE a.team_id = ?2
           AND a.page_id = ?3
           AND a.action IN (?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(activity_id, guest_name) DO NOTHING`,
      )
      .bind(params.guestName, params.teamId, row.page_id, ...FEED_ACTIONS)
      .run();
  } else {
    await db
      .prepare("INSERT INTO activity_acks (activity_id, guest_name) VALUES (?1, ?2) ON CONFLICT(activity_id, guest_name) DO NOTHING")
      .bind(params.activityId, params.guestName)
      .run();
  }
  return true;
}

/** "전체 확인": acks every feed entry currently unacked by this guest, not just the ones the client has fetched (limit-capped) so nothing is left dangling. */
export async function ackAllActivity(db: Env["DB"], teamId: string, viewer: { userId: string; guestName: string }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO activity_acks (activity_id, guest_name)
       SELECT a.id, ?1
       FROM activity_logs a
       WHERE a.team_id = ?3
         AND a.page_id IS NOT NULL
         AND a.actor_id IS NOT NULL
         AND ${NOT_SELF_CLAUSE}
         AND a.action IN (?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(activity_id, guest_name) DO NOTHING`,
    )
    .bind(viewer.guestName, viewer.userId, teamId, ...FEED_ACTIONS)
    .run();
}
