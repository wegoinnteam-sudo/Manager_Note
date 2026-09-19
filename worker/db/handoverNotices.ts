import type { Env } from "../types";
import type { HandoverCategory, HandoverNoticeDTO } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";
import { listPhotosByNoticeIds, toHandoverPhotoDTO } from "./handoverPhotos";

interface HandoverNoticeRow {
  id: string;
  notice_date: string;
  notice_time: string;
  from_name: string;
  reference: string;
  category: HandoverCategory;
  body: string;
  is_done: number;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toDto(row: HandoverNoticeRow, photos: HandoverNoticeDTO["photos"] = []): HandoverNoticeDTO {
  return {
    id: row.id,
    noticeDate: row.notice_date,
    noticeTime: row.notice_time,
    fromName: row.from_name,
    reference: row.reference,
    category: row.category,
    body: row.body,
    isDone: row.is_done === 1,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
  };
}

export async function listHandoverNotices(db: Env["DB"], teamId: string): Promise<HandoverNoticeDTO[]> {
  const { results } = await db
    .prepare(
      `SELECT id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, created_by, created_at, updated_at
       FROM handover_notices
       WHERE team_id = ?1 AND is_deleted = 0
       ORDER BY notice_date DESC, notice_time DESC, created_at DESC`,
    )
    .bind(teamId)
    .all<HandoverNoticeRow>();
  const rows = results ?? [];
  const photosByNotice = await listPhotosByNoticeIds(db, rows.map((row) => row.id));
  return rows.map((row) => toDto(row, (photosByNotice.get(row.id) ?? []).map(toHandoverPhotoDTO)));
}

export async function createHandoverNotice(
  db: Env["DB"],
  teamId: string,
  input: {
    noticeDate: string;
    noticeTime: string;
    fromName: string;
    reference: string;
    category: HandoverCategory;
    body: string;
  },
  createdBy: string,
): Promise<HandoverNoticeDTO> {
  const id = newId("handover");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO handover_notices
         (id, team_id, notice_date, notice_time, from_name, reference, category, body, is_done, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10, ?10)`,
    )
    .bind(id, teamId, input.noticeDate, input.noticeTime, input.fromName, input.reference, input.category, input.body, createdBy, now)
    .run();

  return {
    id,
    noticeDate: input.noticeDate,
    noticeTime: input.noticeTime,
    fromName: input.fromName,
    reference: input.reference,
    category: input.category,
    body: input.body,
    isDone: false,
    completedBy: null,
    completedAt: null,
    createdBy,
    createdAt: now,
    updatedAt: now,
    photos: [],
  };
}

// Toggles completion. Marking done stamps who completed it and when;
// clearing it (undo) wipes both, matching the mockup's "완료 취소" behavior
// (the board only ever shows the current completer, not a history).
export async function setHandoverNoticeDone(
  db: Env["DB"],
  teamId: string,
  id: string,
  input: { isDone: boolean; completedBy: string | null },
): Promise<HandoverNoticeDTO | null> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE handover_notices
       SET is_done = ?1, completed_by = ?2, completed_at = ?3, updated_at = ?4
       WHERE id = ?5 AND team_id = ?6 AND is_deleted = 0`,
    )
    .bind(input.isDone ? 1 : 0, input.isDone ? input.completedBy : null, input.isDone ? now : null, now, id, teamId)
    .run();

  const row = await db
    .prepare(
      `SELECT id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, created_by, created_at, updated_at
       FROM handover_notices WHERE id = ?1 AND team_id = ?2`,
    )
    .bind(id, teamId)
    .first<HandoverNoticeRow>();
  return row ? toDto(row) : null;
}

export async function softDeleteHandoverNotice(db: Env["DB"], teamId: string, id: string): Promise<boolean> {
  const { meta } = await db
    .prepare("UPDATE handover_notices SET is_deleted = 1, updated_at = ?1 WHERE id = ?2 AND team_id = ?3 AND is_deleted = 0")
    .bind(nowIso(), id, teamId)
    .run();
  return meta.changes > 0;
}
