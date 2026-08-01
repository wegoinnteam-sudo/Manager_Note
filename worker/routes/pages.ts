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
import { createQuestionSchema, onboardingProgressSchema, resolveQuestionSchema } from "../lib/validation";
import {
  createQuestion,
  listOnboardingProgress,
  listQuestions,
  setOnboardingProgress,
  setQuestionResolved,
} from "../db/handoff";
import { getSecretValue, setSecretValue } from "../db/secrets";
import { secretValueSchema } from "../lib/validation";

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
    category: body.category,
    description: body.description,
    tags: body.tags,
    orderKey: body.orderKey,
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

  // A page with a due date is being used as a calendar schedule — only its
  // author or an admin may change it. Pages without a due date keep the
  // normal shared-editor behavior used everywhere else in this workspace.
  if (before.due_date && user.role !== "admin" && before.created_by !== user.id) {
    throw Errors.forbidden("본인이 작성한 일정만 수정할 수 있습니다.");
  }

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
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      allDay: body.allDay,
      tags: body.tags,
      parentId: body.parentId,
      orderKey: body.orderKey,
      textColor: body.textColor,
      highlightColor: body.highlightColor,
      category: body.category,
      description: body.description,
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
  const user = c.var.user!;
  const page = await getPageById(c.env.DB, c.var.teamId, id);
  if (!page) throw Errors.notFound();
  if (page.is_system) throw Errors.forbidden("시스템 페이지는 삭제할 수 없습니다.");
  if (page.due_date && user.role !== "admin" && page.created_by !== user.id) {
    throw Errors.forbidden("본인이 작성한 일정만 삭제할 수 있습니다.");
  }
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
  const comment = await createComment(c.env.DB, { pageId: page.id, authorId: user.id, authorName: user.name, guestName: body.authorName, body: body.body });
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

pagesRoute.get("/:id/questions", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const rows = await listQuestions(c.env.DB, page.id);
  return c.json({
    questions: rows.map((row) => ({
      id: row.id,
      pageId: row.page_id,
      blockId: row.block_id,
      blockLabel: row.block_label,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      status: row.status,
      resolvedByName: row.resolved_by_name,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    })),
  });
});

pagesRoute.post("/:id/questions", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const body = createQuestionSchema.parse(await c.req.json());
  const id = await createQuestion(c.env.DB, {
    pageId: page.id,
    authorId: c.var.user!.id,
    blockId: body.blockId ?? null,
    blockLabel: body.blockLabel ?? null,
    body: body.body,
  });
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    actorId: c.var.user!.id,
    action: "question.created",
    metadata: { questionId: id, blockId: body.blockId ?? null },
  });
  return c.json({ id }, 201);
});

pagesRoute.patch("/:id/questions/:questionId", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const body = resolveQuestionSchema.parse(await c.req.json());
  await setQuestionResolved(c.env.DB, {
    id: c.req.param("questionId"),
    pageId: page.id,
    userId: c.var.user!.id,
    resolved: body.resolved,
  });
  return c.json({ ok: true });
});

pagesRoute.get("/:id/onboarding-progress", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  return c.json({ completedBlockIds: await listOnboardingProgress(c.env.DB, page.id, c.var.user!.id) });
});

pagesRoute.put("/:id/onboarding-progress", async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const body = onboardingProgressSchema.parse(await c.req.json());
  await setOnboardingProgress(c.env.DB, {
    pageId: page.id,
    userId: c.var.user!.id,
    blockId: body.blockId,
    completed: body.completed,
  });
  return c.json({ ok: true });
});

pagesRoute.post("/:id/restore", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const page = await getPageById(c.env.DB, c.var.teamId, id);
  if (!page) throw Errors.notFound();
  await restorePage(c.env.DB, c.var.teamId, id);
  await logActivity(c.env.DB, { teamId: c.var.teamId, pageId: id, actorId: c.var.user!.id, action: "page.restored" });
  return c.json({ ok: true });
});

// 민감정보 블록: the real value never rides along with the normal page
// content fetch/save — it only ever leaves the server through this pair of
// endpoints, gated at editor-and-above, with every reveal audit-logged.
pagesRoute.get("/:id/secrets/:blockId", requireRole("editor"), async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const row = await getSecretValue(c.env.DB, c.var.teamId, page.id, c.req.param("blockId"));
  if (!row) throw Errors.notFound("아직 값이 설정되지 않았습니다.");
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    actorId: c.var.user!.id,
    action: "sensitive_block.revealed",
    metadata: { blockId: c.req.param("blockId") },
  });
  return c.json({ value: row.value });
});

pagesRoute.put("/:id/secrets/:blockId", requireRole("editor"), async (c) => {
  const page = await getPageById(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!page) throw Errors.notFound();
  const body = secretValueSchema.parse(await c.req.json());
  await setSecretValue(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    blockId: c.req.param("blockId"),
    value: body.value,
    userId: c.var.user!.id,
  });
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: page.id,
    actorId: c.var.user!.id,
    action: "sensitive_block.updated",
    metadata: { blockId: c.req.param("blockId") },
  });
  return c.json({ ok: true });
});
