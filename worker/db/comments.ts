import type { Env } from "../types";
import { newId, nowIso } from "../lib/ids";

export interface CommentRow {
  id: string;
  page_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function listCommentsByPage(db: Env["DB"], pageId: string): Promise<CommentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.page_id, c.author_id, u.name as author_name, c.body, c.created_at, c.updated_at
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.page_id = ?1 AND c.is_deleted = 0 ORDER BY c.created_at ASC`,
    )
    .bind(pageId)
    .all<CommentRow>();
  return results ?? [];
}

export async function createComment(
  db: Env["DB"],
  params: { pageId: string; authorId: string; authorName: string; body: string },
): Promise<CommentRow> {
  const id = newId("cmt");
  const now = nowIso();
  await db
    .prepare("INSERT INTO comments (id, page_id, author_id, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)")
    .bind(id, params.pageId, params.authorId, params.body, now)
    .run();
  return {
    id,
    page_id: params.pageId,
    author_id: params.authorId,
    author_name: params.authorName,
    body: params.body,
    created_at: now,
    updated_at: now,
  };
}
