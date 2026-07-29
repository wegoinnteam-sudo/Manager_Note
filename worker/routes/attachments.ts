import { Hono, type Context } from "hono";
import type { AppBindings } from "../types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import { getAttachmentById, softDeleteAttachment } from "../db/attachments";
import { getPageById } from "../db/pages";
import { getFileMediaStream, getFileThumbnailStream, moveFile } from "../drive/client";
import { getTeamFolderIds } from "../drive/folders";
import { logActivity } from "../db/activityLog";

export const attachmentsRoute = new Hono<AppBindings>();

attachmentsRoute.use("*", requireAuth);

async function loadAuthorizedAttachment(c: Context<AppBindings>) {
  const id = c.req.param("id");
  if (!id) throw Errors.badRequest();
  const attachment = await getAttachmentById(c.env.DB, id);
  if (!attachment || attachment.is_deleted) throw Errors.notFound("파일을 찾을 수 없습니다.");
  // Re-verify the attachment's page belongs to the caller's team — this is
  // the server-side check that stops anyone from guessing another team's
  // attachment id; the frontend never gets to decide access on its own.
  const page = await getPageById(c.env.DB, c.var.teamId, attachment.page_id);
  if (!page) throw Errors.forbidden();
  if (attachment.status !== "ready" || !attachment.drive_file_id) {
    throw Errors.notFound("아직 처리 중이거나 실패한 파일입니다.");
  }
  return attachment;
}

async function streamFromDrive(c: Context<AppBindings>, disposition: "inline" | "attachment") {
  const attachment = await loadAuthorizedAttachment(c);
  const driveRes = await getFileMediaStream(c.env, attachment.drive_file_id!);
  const headers = new Headers();
  headers.set("Content-Type", attachment.mime_type);
  headers.set("Content-Length", String(attachment.size_bytes));
  const safeName = attachment.file_name.replace(/["\r\n]/g, "");
  headers.set("Content-Disposition", `${disposition}; filename="${encodeURIComponent(safeName)}"`);
  headers.set("Cache-Control", "private, max-age=0, no-cache");
  return new Response(driveRes.body, { status: 200, headers });
}

attachmentsRoute.get("/:id/preview", (c) => streamFromDrive(c, "inline"));
attachmentsRoute.get("/:id/download", (c) => streamFromDrive(c, "attachment"));
attachmentsRoute.get("/:id/thumbnail", async (c) => {
  const attachment = await loadAuthorizedAttachment(c);
  const thumbnailRes = await getFileThumbnailStream(c.env, attachment.drive_file_id!);
  const headers = new Headers();
  headers.set("Content-Type", thumbnailRes.headers.get("Content-Type") || "image/jpeg");
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(thumbnailRes.body, { status: 200, headers });
});

attachmentsRoute.delete("/:id", requireRole("editor"), async (c) => {
  const attachment = await loadAuthorizedAttachment(c);
  // Soft delete: move the Drive original into the Deleted folder rather
  // than destroying it immediately (see docs/backup.md).
  try {
    const folders = await getTeamFolderIds(c.env);
    await moveFile(c.env, attachment.drive_file_id!, { addParent: folders.Deleted });
  } catch {
    // If the Drive move fails we still soft-delete in D1 so the file
    // disappears from the UI; a periodic sync reconciliation can retry
    // the Drive-side move later.
  }
  await softDeleteAttachment(c.env.DB, attachment.id);
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: attachment.page_id,
    actorId: c.var.user!.id,
    action: "attachment.deleted",
    metadata: { attachmentId: attachment.id, fileName: attachment.file_name },
  });
  return c.json({ ok: true });
});
