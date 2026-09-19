import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import { HANDOVER_ALL_ACK_NAMES, HANDOVER_CATEGORIES, IMAGE_EXTENSIONS } from "../../shared/types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import { extensionOf } from "../lib/validation";
import {
  createHandoverNotice,
  getHandoverNoticeCategory,
  listHandoverNotices,
  setHandoverNoticeAck,
  setHandoverNoticeDone,
  softDeleteHandoverNotice,
  updateHandoverNotice,
} from "../db/handoverNotices";
import { createHandoverPhoto, deleteHandoverPhotoRow, getHandoverPhotoForTeam, toHandoverPhotoDTO } from "../db/handoverPhotos";
import { createHandoverComment } from "../db/handoverComments";
import { uploadFileStreaming, getFileMediaStream, getFileThumbnailStream, deleteFilePermanently } from "../drive/client";
import { getTeamFolderIds } from "../drive/folders";

export const handoverRoute = new Hono<AppBindings>();

handoverRoute.use("*", requireAuth);

handoverRoute.get("/", async (c) => {
  return c.json({ notices: await listHandoverNotices(c.env.DB, c.var.teamId) });
});

const nameSchema = z.string().trim().min(1).max(60);
const categorySchema = z.enum(HANDOVER_CATEGORIES as [string, ...string[]]);

const createSchema = z.object({
  noticeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noticeTime: z.string().regex(/^\d{2}:\d{2}$/),
  fromName: nameSchema,
  reference: z.string().trim().min(1).max(200),
  category: categorySchema,
  body: z.string().trim().min(1).max(2000),
});

handoverRoute.post("/", requireRole("editor"), async (c) => {
  const input = createSchema.parse(await c.req.json());
  const notice = await createHandoverNotice(c.env.DB, c.var.teamId, input as any, c.var.user!.id);
  return c.json(notice, 201);
});

const setDoneSchema = z
  .object({
    isDone: z.boolean(),
    completedBy: nameSchema.optional(),
  })
  .refine((value) => !value.isDone || !!value.completedBy, {
    message: "완료자를 먼저 선택해주세요.",
    path: ["completedBy"],
  });

handoverRoute.patch("/:id/done", requireRole("editor"), async (c) => {
  const id = c.req.param("id");
  const category = await getHandoverNoticeCategory(c.env.DB, c.var.teamId, id);
  if (!category) throw Errors.notFound("인수인계 항목을 찾을 수 없습니다.");
  if (category === "everyone") {
    throw Errors.badRequest("All 항목은 완료자 대신 각자 확인(v) 체크로 처리해주세요.");
  }

  const input = setDoneSchema.parse(await c.req.json());
  const notice = await setHandoverNoticeDone(c.env.DB, c.var.teamId, id, {
    isDone: input.isDone,
    completedBy: input.isDone ? input.completedBy! : null,
  });
  if (!notice) throw Errors.notFound("인수인계 항목을 찾을 수 없습니다.");
  return c.json(notice);
});

const setAckSchema = z.object({
  name: z.enum(HANDOVER_ALL_ACK_NAMES),
  acked: z.boolean(),
});

handoverRoute.patch("/:id/ack", requireRole("editor"), async (c) => {
  const input = setAckSchema.parse(await c.req.json());
  const notice = await setHandoverNoticeAck(c.env.DB, c.var.teamId, c.req.param("id"), input.name, input.acked);
  if (!notice) throw Errors.notFound("All 항목을 찾을 수 없습니다.");
  return c.json(notice);
});

handoverRoute.delete("/:id", requireRole("editor"), async (c) => {
  const deleted = await softDeleteHandoverNotice(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!deleted) throw Errors.notFound("인수인계 항목을 찾을 수 없습니다.");
  return c.json({ ok: true });
});

handoverRoute.patch("/:id", requireRole("editor"), async (c) => {
  const input = createSchema.parse(await c.req.json());
  const notice = await updateHandoverNotice(c.env.DB, c.var.teamId, c.req.param("id"), input as any);
  if (!notice) throw Errors.notFound("인수인계 항목을 찾을 수 없습니다.");
  return c.json(notice);
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  authorName: nameSchema.optional(),
});

handoverRoute.post("/:id/comments", requireRole("editor"), async (c) => {
  const input = createCommentSchema.parse(await c.req.json());
  const user = c.var.user!;
  const comment = await createHandoverComment(c.env.DB, {
    noticeId: c.req.param("id"),
    teamId: c.var.teamId,
    authorId: user.id,
    authorName: user.name,
    guestName: input.authorName,
    body: input.body,
  });
  return c.json(comment, 201);
});

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

// Raw-binary upload (not multipart), same convention as
// worker/routes/pages.ts's attachment upload: the Worker streams straight
// through to Drive without buffering, and the frontend sends one file per
// request. Unlike page attachments there's no pending/failed status
// machine or R2 mirror here — a rejected notice photo just fails the
// request outright, no D1 row is left behind either way.
handoverRoute.post("/:id/photos", requireRole("editor"), async (c) => {
  const noticeId = c.req.param("id");

  const fileNameHeader = c.req.header("x-file-name");
  if (!fileNameHeader) throw Errors.badRequest("X-File-Name 헤더가 필요합니다.");
  const fileName = decodeURIComponent(fileNameHeader).slice(0, 255);
  const extension = extensionOf(fileName);
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw Errors.unsupportedMedia(`이미지 파일만 첨부할 수 있습니다: .${extension || "?"}`);
  }

  const sizeHeader = c.req.header("content-length");
  const sizeBytes = sizeHeader ? Number(sizeHeader) : NaN;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw Errors.badRequest("Content-Length 헤더가 필요합니다.");
  }
  if (sizeBytes > MAX_PHOTO_BYTES) {
    throw Errors.payloadTooLarge(`사진 크기는 ${MAX_PHOTO_BYTES / 1024 / 1024}MB를 초과할 수 없습니다.`);
  }

  const mimeType = c.req.header("content-type") || "application/octet-stream";
  const body = c.req.raw.body;
  if (!body) throw Errors.badRequest("업로드할 사진이 없습니다.");

  const folders = await getTeamFolderIds(c.env);
  const driveResult = await uploadFileStreaming(c.env, {
    name: fileName,
    mimeType,
    parentFolderId: folders.Attachments,
    sizeBytes,
    body,
  });

  const photo = await createHandoverPhoto(c.env.DB, {
    noticeId,
    teamId: c.var.teamId,
    fileName,
    mimeType,
    sizeBytes,
    driveFileId: driveResult.id,
    driveWebViewLink: driveResult.webViewLink ?? null,
    uploadedBy: c.var.user!.id,
  });

  return c.json(toHandoverPhotoDTO(photo), 201);
});

const PHOTO_CACHE = "private, max-age=31536000, immutable";

handoverRoute.get("/photos/:id/preview", async (c) => {
  const photo = await getHandoverPhotoForTeam(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!photo) throw Errors.notFound("사진을 찾을 수 없습니다.");
  const driveRes = await getFileMediaStream(c.env, photo.drive_file_id);
  const headers = new Headers();
  headers.set("Content-Type", photo.mime_type);
  headers.set("Content-Length", String(photo.size_bytes));
  headers.set("Cache-Control", PHOTO_CACHE);
  return new Response(driveRes.body, { status: 200, headers });
});

handoverRoute.get("/photos/:id/thumbnail", async (c) => {
  const photo = await getHandoverPhotoForTeam(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!photo) throw Errors.notFound("사진을 찾을 수 없습니다.");
  const thumbnailRes = await getFileThumbnailStream(c.env, photo.drive_file_id);
  const headers = new Headers();
  headers.set("Content-Type", thumbnailRes.headers.get("Content-Type") || "image/jpeg");
  headers.set("Cache-Control", PHOTO_CACHE);
  return new Response(thumbnailRes.body, { status: 200, headers });
});

handoverRoute.delete("/photos/:id", requireRole("editor"), async (c) => {
  const photo = await getHandoverPhotoForTeam(c.env.DB, c.var.teamId, c.req.param("id"));
  if (!photo) throw Errors.notFound("사진을 찾을 수 없습니다.");
  try {
    await deleteFilePermanently(c.env, photo.drive_file_id);
  } catch {
    // Best-effort — the D1 row still goes away so the photo disappears from
    // the UI even if the Drive-side delete failed; an orphaned Drive file
    // is a much smaller problem than a photo the UI can't get rid of.
  }
  await deleteHandoverPhotoRow(c.env.DB, photo.id);
  return c.json({ ok: true });
});
