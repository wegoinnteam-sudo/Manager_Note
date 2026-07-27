import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import {
  createPage,
  getPageById,
  getPageContent,
  listPages,
  restorePage,
  softDeletePage,
  updatePageContent,
  updatePageMeta,
} from "../db/pages";
import { toAttachmentDTO, toPageDetailDTO, toPageSummaryDTO } from "../lib/dto";
import {
  createPageSchema,
  extensionOf,
  isAllowedExtension,
  updatePageContentSchema,
  updatePageMetaSchema,
} from "../lib/validation";
import { recordStatusChange } from "../db/statusHistory";
import { logActivity } from "../db/activityLog";
import { listAttachmentsByPage } from "../db/attachments";
import { runUploadPipeline } from "../lib/uploadPipeline";
import { createComment, listCommentsByPage } from "../db/comments";
import { listStatusHistory } from "../db/statusHistory";
import { toCommentDTO, toStatusHistoryDTO } from "../lib/dto";
import { createCommentSchema } from "../lib/validation";

export const pagesRoute = new Hono<AppBindings>();

pagesRoute.use("*", requireAuth);

pagesRoute.get("/", async (c) => {
  const includeDeleted = c.req.query("trash") === "1";
  const rows = await listPages(c.env.DB, c.var.teamId, { includeDeleted });
  const filtered = includeDeleted ? rows.filter((r) => r.is_deleted) : rows;
  return c.json({ pages: filtered.map(toPageSummaryDTO) });
});

pagesRoute.post("/", requireRole("editor"), async (c) => {
  const body = createPageSchema.parse(await c.req.json().catch(() => ({})));
  const user = c.var.user!;
  const { page, content } = await createPage(c.env.DB, {
    teamId: c.var.teamId,
    parentId: body.parentId ?? null,
    title: body.title ?? null,
    createdBy: user.id,
  });
  await logActivity(c.env.DB, { teamId: c.var.teamId, pageId: page.id, actorId: user.id, action: "page.created" });
  return c.json(toPageDetailDTO(page, content), 201);
});

pagesRoute.get("/:id", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound("페이지를 찾을 수 없습니다.");
  const content = await getPageContent(c.env.DB, page.id);
  if (!content) throw Errors.internal();
  return c.json(toPageDetailDTO(page, content));
});

pagesRoute.patch("/:id", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const body = updatePageMetaSchema.parse(await c.req.json());
  const user = c.var.user!;

  const before = await getPageById(c.env.DB, c.var.teamId, id);
  if (!before) throw Errors.notFound();

  const updated = await updatePageMeta(c.env.DB, {
    teamId: c.var.teamId,
    id,
    expectedVersion: body.expectedVersion,
    updatedBy: user.id,
    patch: {
      title: body.title,
      status: body.status,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate,
      tags: body.tags,
      parentId: body.parentId,
      orderKey: body.orderKey,
    },
  });

  if (body.status && body.status !== before.status) {
    await recordStatusChange(c.env.DB, {
      pageId: id,
      fromStatus: before.status,
      toStatus: body.status,
      changedBy: user.id,
    });
    await logActivity(c.env.DB, {
      teamId: c.var.teamId,
      pageId: id,
      actorId: user.id,
      action: "status.changed",
      metadata: { from: before.status, to: body.status },
    });
  }

  const content = await getPageContent(c.env.DB, id);
  if (!content) throw Errors.internal();
  return c.json(toPageDetailDTO(updated, content));
});

pagesRoute.patch("/:id/content", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const body = updatePageContentSchema.parse(await c.req.json());
  const user = c.var.user!;

  const page = await getPageById(c.env.DB, c.var.teamId, id);
  if (!page) throw Errors.notFound();

  const content = await updatePageContent(c.env.DB, {
    pageId: id,
    expectedVersion: body.expectedVersion,
    content: body.content,
    updatedBy: user.id,
  });

  return c.json(toPageDetailDTO(page, content));
});

pagesRoute.delete("/:id", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const page = await getPageById(c.env.DB, c.var.teamId, id);
  if (!page) throw Errors.notFound();
  if (page.is_system) throw Errors.forbidden("시스템 페이지는 삭제할 수 없습니다.");
  await softDeletePage(c.env.DB, c.var.teamId, id);
  await logActivity(c.env.DB, { teamId: c.var.teamId, pageId: id, actorId: c.var.user!.id, action: "page.deleted" });
  return c.json({ ok: true });
});

pagesRoute.get("/:id/attachments", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const rows = await listAttachmentsByPage(c.env.DB, page.id);
  return c.json({ attachments: rows.map(toAttachmentDTO) });
});

// Files are uploaded one at a time as a raw binary body (not multipart) so
// the Worker can stream bytes straight through to Google Drive / R2 without
// ever buffering a whole file. The frontend fires one request per dropped
// file when multiple files are dropped at once.
pagesRoute.post("/:id/attachments", requireRole("editor"), async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();

  const fileNameHeader = c.req.header("x-file-name");
  if (!fileNameHeader) throw Errors.badRequest("X-File-Name 헤더가 필요합니다.");
  const fileName = decodeURIComponent(fileNameHeader).slice(0, 255);
  const extension = extensionOf(fileName);
  if (!extension || !isAllowedExtension(extension)) {
    throw Errors.unsupportedMedia(`허용되지 않은 파일 형식입니다: .${extension || "?"}`);
  }

  const sizeHeader = c.req.header("content-length");
  const sizeBytes = sizeHeader ? Number(sizeHeader) : NaN;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw Errors.badRequest("Content-Length 헤더가 필요합니다.");
  }
  const maxBytes = Number(c.env.MAX_UPLOAD_MB || "50") * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw Errors.payloadTooLarge(`파일 크기는 ${c.env.MAX_UPLOAD_MB}MB를 초과할 수 없습니다.`);
  }

  const mimeType = c.req.header("content-type") || "application/octet-stream";
  const idempotencyKey = c.req.header("x-idempotency-key") || null;
  const body = c.req.raw.body;
  if (!body) throw Errors.badRequest("업로드할 파일 본문이 없습니다.");

  const user = c.var.user!;
  const attachment = await runUploadPipeline(c.env, {
    pageId: page.id,
    teamId: c.var.teamId,
    fileName,
    extension,
    mimeType,
    sizeBytes,
    uploadedBy: user.id,
    idempotencyKey,
    body,
  });

  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    actorId: user.id,
    action: "attachment.uploaded",
    metadata: { attachmentId: attachment.id, fileName },
  });

  return c.json(toAttachmentDTO(attachment), attachment.status === "ready" ? 201 : 502);
});

pagesRoute.get("/:id/comments", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const rows = await listCommentsByPage(c.env.DB, page.id);
  return c.json({ comments: rows.map(toCommentDTO) });
});

pagesRoute.post("/:id/comments", requireRole("editor"), async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const body = createCommentSchema.parse(await c.req.json());
  const user = c.var.user!;
  const comment = await createComment(c.env.DB, { pageId: page.id, authorId: user.id, authorName: user.name, body: body.body });
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    actorId: user.id,
    action: "comment.created",
    metadata: { commentId: comment.id },
  });
  return c.json(toCommentDTO(comment), 201);
});

pagesRoute.get("/:id/history", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const rows = await listStatusHistory(c.env.DB, page.id);
  return c.json({ history: rows.map(toStatusHistoryDTO) });
});

pagesRoute.post("/:id/restore", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const page = await getPageById(c.env.DB, c.var.teamId, id);
  if (!page) throw Errors.notFound();
  await restorePage(c.env.DB, c.var.teamId, id);
  await logActivity(c.env.DB, { teamId: c.var.teamId, pageId: id, actorId: c.var.user!.id, action: "page.restored" });
  return c.json({ ok: true });
});
