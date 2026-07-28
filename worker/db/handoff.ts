import type { Env } from "../types";
import { newId, nowIso } from "../lib/ids";

export interface InlineQuestionRow {
  id: string;
  page_id: string;
  block_id: string | null;
  block_label: string | null;
  author_id: string;
  author_name: string;
  body: string;
  status: "open" | "resolved";
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export async function listQuestions(db: Env["DB"], pageId: string): Promise<InlineQuestionRow[]> {
  const { results } = await db.prepare(
    `SELECT q.id, q.page_id, q.block_id, q.block_label, q.author_id,
            author.name AS author_name, q.body, q.status,
            resolver.name AS resolved_by_name, q.resolved_at, q.created_at
     FROM inline_questions q
     JOIN users author ON author.id = q.author_id
     LEFT JOIN users resolver ON resolver.id = q.resolved_by
     WHERE q.page_id = ?1
     ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END, q.created_at DESC`,
  ).bind(pageId).all<InlineQuestionRow>();
  return results ?? [];
}

export async function createQuestion(
  db: Env["DB"],
  params: { pageId: string; authorId: string; blockId: string | null; blockLabel: string | null; body: string },
) {
  const id = newId("qst");
  const now = nowIso();
  await db.prepare(
    `INSERT INTO inline_questions (id, page_id, block_id, block_label, author_id, body, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(id, params.pageId, params.blockId, params.blockLabel, params.authorId, params.body, now).run();
  return id;
}

export async function setQuestionResolved(db: Env["DB"], params: { id: string; pageId: string; userId: string; resolved: boolean }) {
  const now = nowIso();
  await db.prepare(
    `UPDATE inline_questions
     SET status = ?1, resolved_by = ?2, resolved_at = ?3, updated_at = ?4
     WHERE id = ?5 AND page_id = ?6`,
  ).bind(params.resolved ? "resolved" : "open", params.resolved ? params.userId : null, params.resolved ? now : null, now, params.id, params.pageId).run();
}

export async function listOnboardingProgress(db: Env["DB"], pageId: string, userId: string): Promise<string[]> {
  const { results } = await db.prepare(
    "SELECT block_id FROM onboarding_progress WHERE page_id = ?1 AND user_id = ?2",
  ).bind(pageId, userId).all<{ block_id: string }>();
  return (results ?? []).map((row) => row.block_id);
}

export async function setOnboardingProgress(
  db: Env["DB"],
  params: { pageId: string; userId: string; blockId: string; completed: boolean },
) {
  if (params.completed) {
    await db.prepare(
      `INSERT INTO onboarding_progress (page_id, user_id, block_id) VALUES (?1, ?2, ?3)
       ON CONFLICT(page_id, user_id, block_id) DO UPDATE SET completed_at = excluded.completed_at`,
    ).bind(params.pageId, params.userId, params.blockId).run();
  } else {
    await db.prepare(
      "DELETE FROM onboarding_progress WHERE page_id = ?1 AND user_id = ?2 AND block_id = ?3",
    ).bind(params.pageId, params.userId, params.blockId).run();
  }
}
