import type { Env } from "../types";
import type { HandoverPhotoDTO } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";

export interface HandoverPhotoRow {
  id: string;
  notice_id: string;
  team_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  drive_file_id: string;
  drive_web_view_link: string | null;
  uploaded_by: string;
  created_at: string;
}

export function toHandoverPhotoDTO(row: HandoverPhotoRow): HandoverPhotoDTO {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: `/api/handover/photos/${row.id}/preview`,
    thumbnailUrl: `/api/handover/photos/${row.id}/thumbnail`,
  };
}

// One query for every notice on the board at once, grouped by notice_id —
// the board renders every notice on a single screen, so fetching photos
// per-row would mean one request per notice instead of one for all of them.
export async function listPhotosByNoticeIds(db: Env["DB"], noticeIds: string[]): Promise<Map<string, HandoverPhotoRow[]>> {
  const byNotice = new Map<string, HandoverPhotoRow[]>();
  if (noticeIds.length === 0) return byNotice;

  const placeholders = noticeIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT id, notice_id, team_id, file_name, mime_type, size_bytes, drive_file_id, drive_web_view_link, uploaded_by, created_at
       FROM handover_notice_photos WHERE notice_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .bind(...noticeIds)
    .all<HandoverPhotoRow>();

  for (const row of results ?? []) {
    const list = byNotice.get(row.notice_id) ?? [];
    list.push(row);
    byNotice.set(row.notice_id, list);
  }
  return byNotice;
}

export async function createHandoverPhoto(
  db: Env["DB"],
  params: {
    noticeId: string;
    teamId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    driveFileId: string;
    driveWebViewLink: string | null;
    uploadedBy: string;
  },
): Promise<HandoverPhotoRow> {
  const id = newId("hphoto");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO handover_notice_photos
         (id, notice_id, team_id, file_name, mime_type, size_bytes, drive_file_id, drive_web_view_link, uploaded_by, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      id,
      params.noticeId,
      params.teamId,
      params.fileName,
      params.mimeType,
      params.sizeBytes,
      params.driveFileId,
      params.driveWebViewLink,
      params.uploadedBy,
      now,
    )
    .run();
  return {
    id,
    notice_id: params.noticeId,
    team_id: params.teamId,
    file_name: params.fileName,
    mime_type: params.mimeType,
    size_bytes: params.sizeBytes,
    drive_file_id: params.driveFileId,
    drive_web_view_link: params.driveWebViewLink,
    uploaded_by: params.uploadedBy,
    created_at: now,
  };
}

// Team-scoped lookup for the preview/thumbnail/delete routes — a photo has
// no team_id-checked FK of its own worth trusting from the client, so this
// is the server-side check that stops guessing another team's photo id.
export async function getHandoverPhotoForTeam(db: Env["DB"], teamId: string, id: string): Promise<HandoverPhotoRow | null> {
  const row = await db
    .prepare(
      `SELECT id, notice_id, team_id, file_name, mime_type, size_bytes, drive_file_id, drive_web_view_link, uploaded_by, created_at
       FROM handover_notice_photos WHERE id = ?1 AND team_id = ?2`,
    )
    .bind(id, teamId)
    .first<HandoverPhotoRow>();
  return row ?? null;
}

export async function deleteHandoverPhotoRow(db: Env["DB"], id: string): Promise<void> {
  await db.prepare("DELETE FROM handover_notice_photos WHERE id = ?1").bind(id).run();
}
