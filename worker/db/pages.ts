import type { Env } from "../types";
import type { HandoffStatus, PageBlock, PageContent } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";
import { Errors } from "../lib/errors";
import { UNTITLED_PAGE_TITLE } from "../../shared/types";

export interface PageRow {
  id: string;
  team_id: string;
  parent_id: string | null;
  title: string;
  status: HandoffStatus;
  assignee_id: string | null;
  due_date: string | null;
  tags: string; // JSON
  order_key: number;
  text_color: string | null;
  highlight_color: string | null;
  version: number;
  open_question_count?: number;
  is_system: number;
  is_deleted: number;
  deleted_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface PageContentRow {
  page_id: string;
  content_json: string;
  version: number;
  updated_by: string;
  updated_at: string;
}

export async function listPages(
  db: Env["DB"],
  teamId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<PageRow[]> {
  const count = `(
    SELECT COUNT(*) FROM inline_questions q
    WHERE q.page_id = pages.id AND q.status = 'open'
  ) AS open_question_count`;
  const sql = opts.includeDeleted
    ? `SELECT pages.*, ${count} FROM pages WHERE team_id = ?1 ORDER BY order_key ASC, created_at ASC`
    : `SELECT pages.*, ${count} FROM pages WHERE team_id = ?1 AND is_deleted = 0 ORDER BY order_key ASC, created_at ASC`;
  const { results } = await db.prepare(sql).bind(teamId).all<PageRow>();
  return results ?? [];
}

export async function getPageById(db: Env["DB"], teamId: string, id: string): Promise<PageRow | null> {
  const row = await db
    .prepare("SELECT * FROM pages WHERE id = ?1 AND team_id = ?2")
    .bind(id, teamId)
    .first<PageRow>();
  return row ?? null;
}

export async function getPageContent(db: Env["DB"], pageId: string): Promise<PageContentRow | null> {
  const row = await db.prepare("SELECT * FROM page_contents WHERE page_id = ?1").bind(pageId).first<PageContentRow>();
  return row ?? null;
}

export async function createPage(
  db: Env["DB"],
  params: { teamId: string; parentId: string | null; title: string | null; createdBy: string; isSystem?: boolean },
): Promise<{ page: PageRow; content: PageContentRow }> {
  const id = newId("page");
  const now = nowIso();
  const title = params.title?.trim() || UNTITLED_PAGE_TITLE;

  const maxOrder = await db
    .prepare(
      "SELECT COALESCE(MAX(order_key), 0) as m FROM pages WHERE team_id = ?1 AND (parent_id IS ?2)",
    )
    .bind(params.teamId, params.parentId)
    .first<{ m: number }>();
  const orderKey = (maxOrder?.m ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO pages (id, team_id, parent_id, title, order_key, is_system, created_by, updated_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?8)`,
    )
    .bind(id, params.teamId, params.parentId, title, orderKey, params.isSystem ? 1 : 0, params.createdBy, now)
    .run();

  const initialBlocks: PageBlock[] = params.isSystem
    ? []
    : [
        { id: crypto.randomUUID(), type: "heading2", text: "" },
        { id: crypto.randomUUID(), type: "paragraph", text: "" },
      ];

  await db
    .prepare(
      "INSERT INTO page_contents (page_id, content_json, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(id, JSON.stringify({ blocks: initialBlocks } satisfies PageContent), params.createdBy, now)
    .run();

  const page = await getPageById(db, params.teamId, id);
  const content = await getPageContent(db, id);
  if (!page || !content) throw Errors.internal("페이지 생성에 실패했습니다.");
  return { page, content };
}

export async function updatePageMeta(
  db: Env["DB"],
  params: {
    teamId: string;
    id: string;
    expectedVersion: number;
    updatedBy: string;
    patch: Partial<{
      title: string;
      status: HandoffStatus;
      assigneeId: string | null;
      dueDate: string | null;
      tags: string[];
      parentId: string | null;
      orderKey: number;
      textColor: string | null;
      highlightColor: string | null;
    }>;
  },
): Promise<PageRow> {
  const current = await getPageById(db, params.teamId, params.id);
  if (!current || current.is_deleted) throw Errors.notFound("페이지를 찾을 수 없습니다.");
  if (current.version !== params.expectedVersion) throw Errors.conflict();

  const next = {
    title: params.patch.title !== undefined ? params.patch.title.trim() || UNTITLED_PAGE_TITLE : current.title,
    status: params.patch.status ?? current.status,
    assignee_id: params.patch.assigneeId !== undefined ? params.patch.assigneeId : current.assignee_id,
    due_date: params.patch.dueDate !== undefined ? params.patch.dueDate : current.due_date,
    tags: params.patch.tags !== undefined ? JSON.stringify(params.patch.tags) : current.tags,
    parent_id: params.patch.parentId !== undefined ? params.patch.parentId : current.parent_id,
    order_key: params.patch.orderKey !== undefined ? params.patch.orderKey : current.order_key,
    text_color: params.patch.textColor !== undefined ? params.patch.textColor : current.text_color,
    highlight_color: params.patch.highlightColor !== undefined ? params.patch.highlightColor : current.highlight_color,
  };

  const now = nowIso();
  await db
    .prepare(
      `UPDATE pages SET title = ?1, status = ?2, assignee_id = ?3, due_date = ?4, tags = ?5,
       parent_id = ?6, order_key = ?7, text_color = ?8, highlight_color = ?9,
       version = version + 1, updated_by = ?10, updated_at = ?11
       WHERE id = ?12 AND team_id = ?13 AND version = ?14`,
    )
    .bind(
      next.title,
      next.status,
      next.assignee_id,
      next.due_date,
      next.tags,
      next.parent_id,
      next.order_key,
      next.text_color,
      next.highlight_color,
      params.updatedBy,
      now,
      params.id,
      params.teamId,
      params.expectedVersion,
    )
    .run();

  const updated = await getPageById(db, params.teamId, params.id);
  if (!updated) throw Errors.internal();
  if (updated.version !== params.expectedVersion + 1) throw Errors.conflict();
  return updated;
}

export async function updatePageContent(
  db: Env["DB"],
  params: { pageId: string; expectedVersion: number; content: PageContent; updatedBy: string },
): Promise<PageContentRow> {
  const current = await getPageContent(db, params.pageId);
  if (!current) throw Errors.notFound();
  if (current.version !== params.expectedVersion) throw Errors.conflict();

  const now = nowIso();
  await db
    .prepare(
      `UPDATE page_contents SET content_json = ?1, version = version + 1, updated_by = ?2, updated_at = ?3
       WHERE page_id = ?4 AND version = ?5`,
    )
    .bind(JSON.stringify(params.content), params.updatedBy, now, params.pageId, params.expectedVersion)
    .run();

  const updated = await getPageContent(db, params.pageId);
  if (!updated || updated.version !== params.expectedVersion + 1) throw Errors.conflict();
  return updated;
}

export async function softDeletePage(db: Env["DB"], teamId: string, id: string): Promise<void> {
  await db
    .prepare("UPDATE pages SET is_deleted = 1, deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND team_id = ?3")
    .bind(nowIso(), id, teamId)
    .run();
}

export async function restorePage(db: Env["DB"], teamId: string, id: string): Promise<void> {
  await db
    .prepare("UPDATE pages SET is_deleted = 0, deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND team_id = ?3")
    .bind(nowIso(), id, teamId)
    .run();
}
