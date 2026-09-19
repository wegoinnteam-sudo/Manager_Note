import type { Env } from "../types";
import type { HandoverCategory, HandoverNoticeDTO } from "../../shared/types";
import { HANDOVER_ALL_ACK_COUNT } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";
import { listPhotosByNoticeIds, toHandoverPhotoDTO } from "./handoverPhotos";
import { listAcksByNoticeIds, listAcksForNotice, setAck } from "./handoverNoticeAcks";
import { listCommentsByNoticeIds } from "./handoverComments";

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

// "everyone" (displayed "All") notices are done once HANDOVER_ALL_ACK_COUNT
// people have acked (see handover_ack_roster for the editable names) — the
// is_done/completed_by columns are never written for that category, so
// isDone is derived here instead of read straight off the row like every
// other category.
function toDto(
  row: HandoverNoticeRow,
  photos: HandoverNoticeDTO["photos"] = [],
  acks: string[] = [],
  comments: HandoverNoticeDTO["comments"] = [],
): HandoverNoticeDTO {
  return {
    id: row.id,
    noticeDate: row.notice_date,
    noticeTime: row.notice_time,
    fromName: row.from_name,
    reference: row.reference,
    category: row.category,
    body: row.body,
    isDone: row.category === "everyone" ? acks.length >= HANDOVER_ALL_ACK_COUNT : row.is_done === 1,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
    comments,
    acks,
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
  const noticeIds = rows.map((row) => row.id);
  const [photosByNotice, acksByNotice, commentsByNotice] = await Promise.all([
    listPhotosByNoticeIds(db, noticeIds),
    listAcksByNoticeIds(db, noticeIds),
    listCommentsByNoticeIds(db, noticeIds),
  ]);
  return rows.map((row) =>
    toDto(
      row,
      (photosByNotice.get(row.id) ?? []).map(toHandoverPhotoDTO),
      acksByNotice.get(row.id) ?? [],
      commentsByNotice.get(row.id) ?? [],
    ),
  );
}

export async function getHandoverNoticeCategory(db: Env["DB"], teamId: string, id: string): Promise<HandoverCategory | null> {
  const row = await db
    .prepare("SELECT category FROM handover_notices WHERE id = ?1 AND team_id = ?2 AND is_deleted = 0")
    .bind(id, teamId)
    .first<{ category: HandoverCategory }>();
  return row?.category ?? null;
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
    comments: [],
    acks: [],
  };
}

export async function updateHandoverNotice(
  db: Env["DB"],
  teamId: string,
  id: string,
  input: {
    noticeDate: string;
    noticeTime: string;
    fromName: string;
    reference: string;
    category: HandoverCategory;
    body: string;
  },
): Promise<HandoverNoticeDTO | null> {
  const now = nowIso();
  const { meta } = await db
    .prepare(
      `UPDATE handover_notices
       SET notice_date = ?1, notice_time = ?2, from_name = ?3, reference = ?4, category = ?5, body = ?6, updated_at = ?7
       WHERE id = ?8 AND team_id = ?9 AND is_deleted = 0`,
    )
    .bind(input.noticeDate, input.noticeTime, input.fromName, input.reference, input.category, input.body, now, id, teamId)
    .run();
  if (meta.changes === 0) return null;

  const row = await db
    .prepare(
      `SELECT id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, created_by, created_at, updated_at
       FROM handover_notices WHERE id = ?1 AND team_id = ?2`,
    )
    .bind(id, teamId)
    .first<HandoverNoticeRow>();
  if (!row) return null;
  const acks = row.category === "everyone" ? await listAcksForNotice(db, id) : [];
  return toDto(row, [], acks);
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

// Toggles one person's ack on an "everyone"-category notice. Returns null
// for a missing notice or one that isn't in that category — the two share
// a not-found response since a category mismatch means this endpoint
// simply doesn't apply, same as the id not existing at all.
export async function setHandoverNoticeAck(
  db: Env["DB"],
  teamId: string,
  id: string,
  name: string,
  acked: boolean,
): Promise<HandoverNoticeDTO | null> {
  const row = await db
    .prepare(
      `SELECT id, notice_date, notice_time, from_name, reference, category, body, is_done, completed_by, completed_at, created_by, created_at, updated_at
       FROM handover_notices WHERE id = ?1 AND team_id = ?2 AND is_deleted = 0`,
    )
    .bind(id, teamId)
    .first<HandoverNoticeRow>();
  if (!row || row.category !== "everyone") return null;

  await setAck(db, id, name, acked);
  const acks = await listAcksForNotice(db, id);
  return toDto(row, [], acks);
}

export async function softDeleteHandoverNotice(db: Env["DB"], teamId: string, id: string): Promise<boolean> {
  const { meta } = await db
    .prepare("UPDATE handover_notices SET is_deleted = 1, updated_at = ?1 WHERE id = ?2 AND team_id = ?3 AND is_deleted = 0")
    .bind(nowIso(), id, teamId)
    .run();
  return meta.changes > 0;
}
