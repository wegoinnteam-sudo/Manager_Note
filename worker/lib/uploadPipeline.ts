import type { Env } from "../types";
import { uploadFileStreaming, deleteFilePermanently } from "../drive/client";
import { getTeamFolderIds } from "../drive/folders";
import {
  createPendingAttachment,
  findByIdempotencyKey,
  getAttachmentById,
  hardDeleteAttachmentRow,
  markAttachmentFailed,
  markAttachmentReady,
  type AttachmentRow,
} from "../db/attachments";
import { logActivity } from "../db/activityLog";
import { Errors } from "../lib/errors";

export interface UploadRequest {
  pageId: string;
  teamId: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  idempotencyKey: string | null;
  body: ReadableStream<Uint8Array>;
}

/**
 * Full upload flow: Drive is the source of truth, D1 holds metadata, and an
 * optional R2 mirror runs concurrently off a teed copy of the same stream
 * (nothing is buffered twice in Worker memory). Handles the Drive-succeeds/
 * D1-fails race with a best-effort compensating delete on Drive, per the
 * architecture's "no orphan files" requirement.
 */
export async function runUploadPipeline(env: Env, req: UploadRequest): Promise<AttachmentRow> {
  if (req.idempotencyKey) {
    const existing = await findByIdempotencyKey(env.DB, req.idempotencyKey);
    if (existing && existing.status === "ready") return existing;
    if (existing && existing.status === "pending") {
      throw Errors.conflict("이미 처리 중인 업로드입니다. 잠시 후 다시 시도하세요.");
    }
    // A prior attempt with this key failed outright (e.g. Drive rejected the
    // upload). The unique index on idempotency_key means we must clear that
    // row before retrying under the same key.
    if (existing && existing.status === "failed") {
      await hardDeleteAttachmentRow(env.DB, existing.id);
    }
  }

  const pending = await createPendingAttachment(env.DB, {
    pageId: req.pageId,
    fileName: req.fileName,
    extension: req.extension,
    mimeType: req.mimeType,
    sizeBytes: req.sizeBytes,
    uploadedBy: req.uploadedBy,
    idempotencyKey: req.idempotencyKey,
  });

  const folders = await getTeamFolderIds(env);
  const r2Enabled = env.ENABLE_R2_BACKUP === "true" && !!env.BACKUP_BUCKET;
  const [driveStream, backupStream] = r2Enabled ? req.body.tee() : [req.body, null];

  let driveResult;
  try {
    const [driveOutcome, backupOutcome] = await Promise.allSettled([
      uploadFileStreaming(env, {
        name: req.fileName,
        mimeType: req.mimeType,
        parentFolderId: folders.Attachments,
        sizeBytes: req.sizeBytes,
        body: driveStream,
      }),
      backupStream
        ? env.BACKUP_BUCKET.put(`attachments/${pending.id}`, backupStream, {
            httpMetadata: { contentType: req.mimeType },
          })
        : Promise.resolve(null),
    ]);

    if (driveOutcome.status === "rejected") {
      throw driveOutcome.reason;
    }
    driveResult = driveOutcome.value;

    if (backupOutcome.status === "rejected") {
      await logActivity(env.DB, {
        teamId: req.teamId,
        pageId: req.pageId,
        actorId: req.uploadedBy,
        action: "attachment.r2_backup_failed",
        metadata: { attachmentId: pending.id, reason: String(backupOutcome.reason) },
      });
    }

    const r2Key = backupOutcome.status === "fulfilled" && backupOutcome.value ? `attachments/${pending.id}` : null;

    try {
      await markAttachmentReady(env.DB, pending.id, {
        driveFileId: driveResult.id,
        driveWebViewLink: driveResult.webViewLink ?? null,
        checksum: driveResult.md5Checksum ?? null,
        r2BackupKey: r2Key,
      });
    } catch (dbError) {
      // Drive upload succeeded but D1 could not record it: compensate by
      // deleting the orphaned Drive file so Drive and D1 never disagree,
      // then log the incident. Best-effort — failures here are swallowed
      // because there is nothing more we can safely do without a queue.
      try {
        await deleteFilePermanently(env, driveResult.id);
      } catch {
        // fallthrough — file may be an untracked orphan; visible via
        // periodic Drive sync reconciliation.
      }
      try {
        await markAttachmentFailed(env.DB, pending.id, "d1_write_failed_after_drive_upload");
      } catch {
        // D1 is unavailable; nothing more we can do here.
      }
      throw Errors.internal("업로드 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  } catch (err) {
    if (driveResult === undefined) {
      await markAttachmentFailed(env.DB, pending.id, describeError(err));
    }
    throw err;
  }

  const ready = await getAttachmentById(env.DB, pending.id);
  if (!ready) throw Errors.internal();
  return ready;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return "unknown_error";
}
