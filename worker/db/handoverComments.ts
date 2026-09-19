import type { Env } from "../types";
import type { HandoverCommentDTO } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";

interface HandoverCommentRow {
  id: string;
  notice_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

function toDto(row: HandoverCommentRow): HandoverCommentDTO {
  return { id: row.id, authorName: row.author_name, body: row.body, createdAt: row.created_at };
}

// One query for every notice on the board, grouped by notice_id — mirrors
// listPhotosByNoticeIds/listAcksByNoticeIds for the same reason (the board
// renders every notice at once).
export async function listCommentsByNoticeIds(db: Env["DB"], noticeIds: string[]): Promise<Map<string, HandoverCommentDTO[]>> {
  const byNotice = new Map<string, HandoverCommentDTO[]>();
  if (noticeIds.length === 0) return byNotice;

  const placeholders = noticeIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT c.id, c.notice_id, COALESCE(c.author_name, u.name) as author_name, c.body, c.created_at
       FROM handover_notice_comments c JOIN users u ON u.id = c.author_id
       WHERE c.notice_id IN (${placeholders}) AND c.is_deleted = 0
       ORDER BY c.created_at ASC`,
    )
    .bind(...noticeIds)
    .all<HandoverCommentRow>();

  for (const row of results ?? []) {
    const list = byNotice.get(row.notice_id) ?? [];
    list.push(toDto(row));
    byNotice.set(row.notice_id, list);
  }
  return byNotice;
}

export async function createHandoverComment(
  db: Env["DB"],
  params: { noticeId: string; teamId: string; authorId: string; authorName: string; guestName?: string; body: string },
): Promise<HandoverCommentDTO> {
  const id = newId("hcmt");
  const now = nowIso();
  const displayName = params.guestName?.trim() || null;
  await db
    .prepare(
      `INSERT INTO handover_notice_comments (id, notice_id, team_id, author_id, author_name, body, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
    )
    .bind(id, params.noticeId, params.teamId, params.authorId, displayName, params.body, now)
    .run();
  return { id, authorName: displayName ?? params.authorName, body: params.body, createdAt: now };
}
