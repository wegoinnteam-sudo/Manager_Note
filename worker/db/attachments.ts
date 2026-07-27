import type { Env } from "../types";
import type { UploadStatus } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";

export interface AttachmentRow {
  id: string;
  page_id: string;
  file_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  status: UploadStatus;
  drive_file_id: string | null;
  drive_web_view_link: string | null;
  r2_backup_key: string | null;
  idempotency_key: string | null;
  failure_reason: string | null;
  is_deleted: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export async function findByIdempotencyKey(db: Env["DB"], key: string): Promise<AttachmentRow | null> {
  const row = await db.prepare("SELECT * FROM attachments WHERE idempotency_key = ?1").bind(key).first<AttachmentRow>();
  return row ?? null;
}

export async function findByDriveFileId(db: Env["DB"], driveFileId: string): Promise<AttachmentRow | null> {
  const row = await db
    .prepare("SELECT * FROM attachments WHERE drive_file_id = ?1")
    .bind(driveFileId)
    .first<AttachmentRow>();
  return row ?? null;
}

export async function getAttachmentById(db: Env["DB"], id: string): Promise<AttachmentRow | null> {
  const row = await db.prepare("SELECT * FROM attachments WHERE id = ?1").bind(id).first<AttachmentRow>();
  return row ?? null;
}

export async function listAttachmentsByPage(db: Env["DB"], pageId: string): Promise<AttachmentRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM attachments WHERE page_id = ?1 AND is_deleted = 0 ORDER BY created_at DESC")
    .bind(pageId)
    .all<AttachmentRow>();
  return results ?? [];
}

export async function createPendingAttachment(
  db: Env["DB"],
  params: {
    pageId: string;
    fileName: string;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
    idempotencyKey: string | null;
  },
): Promise<AttachmentRow> {
  const id = newId("att");
  await db
    .prepare(
      `INSERT INTO attachments (id, page_id, file_name, extension, mime_type, size_bytes, status, uploaded_by, idempotency_key)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8)`,
    )
    .bind(id, params.pageId, params.fileName, params.extension, params.mimeType, params.sizeBytes, params.uploadedBy, params.idempotencyKey)
    .run();
  const row = await getAttachmentById(db, id);
  if (!row) throw new Error("attachment insert failed");
  return row;
}

export async function markAttachmentReady(
  db: Env["DB"],
  id: string,
  params: { driveFileId: string; driveWebViewLink: string | null; checksum: string | null; r2BackupKey: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE attachments SET status = 'ready', drive_file_id = ?1, drive_web_view_link = ?2, checksum = ?3,
       r2_backup_key = ?4, failure_reason = NULL, updated_at = ?5 WHERE id = ?6`,
    )
    .bind(params.driveFileId, params.driveWebViewLink, params.checksum, params.r2BackupKey, nowIso(), id)
    .run();
}

export async function markAttachmentFailed(db: Env["DB"], id: string, reason: string): Promise<void> {
  await db
    .prepare("UPDATE attachments SET status = 'failed', failure_reason = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(reason, nowIso(), id)
    .run();
}

export async function createReadyAttachmentFromDrive(
  db: Env["DB"],
  params: {
    pageId: string;
    fileName: string;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    driveFileId: string;
    driveWebViewLink: string | null;
    checksum: string | null;
    uploadedBy: string;
  },
): Promise<AttachmentRow> {
  const id = newId("att");
  await db
    .prepare(
      `INSERT INTO attachments
       (id, page_id, file_name, extension, mime_type, size_bytes, status, drive_file_id, drive_web_view_link, checksum, uploaded_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ready', ?7, ?8, ?9, ?10)`,
    )
    .bind(
      id,
      params.pageId,
      params.fileName,
      params.extension,
      params.mimeType,
      params.sizeBytes,
      params.driveFileId,
      params.driveWebViewLink,
      params.checksum,
      params.uploadedBy,
    )
    .run();
  const row = await getAttachmentById(db, id);
  if (!row) throw new Error("attachment insert failed");
  return row;
}

export async function updateAttachmentFromDrive(
  db: Env["DB"],
  id: string,
  params: { fileName: string; mimeType: string; sizeBytes: number; checksum: string | null },
): Promise<void> {
  await db
    .prepare(
      "UPDATE attachments SET file_name = ?1, mime_type = ?2, size_bytes = ?3, checksum = ?4, updated_at = ?5 WHERE id = ?6",
    )
    .bind(params.fileName, params.mimeType, params.sizeBytes, params.checksum, nowIso(), id)
    .run();
}

export async function softDeleteAttachment(db: Env["DB"], id: string): Promise<void> {
  await db
    .prepare("UPDATE attachments SET is_deleted = 1, deleted_at = ?1, updated_at = ?1 WHERE id = ?2")
    .bind(nowIso(), id)
    .run();
}

export async function hardDeleteAttachmentRow(db: Env["DB"], id: string): Promise<void> {
  // Used only when the D1 write itself failed right after a Drive upload
  // succeeded, as part of the upload compensation flow (see routes/attachments.ts).
  await db.prepare("DELETE FROM attachments WHERE id = ?1").bind(id).run();
}
