import { z } from "zod";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_TITLE_LENGTH } from "../../shared/types";

export const pageBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.enum(["heading1", "heading2", "heading3", "paragraph"]), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.enum(["bulleted_list_item", "numbered_list_item"]), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.literal("checklist_item"), text: z.string().max(20000), checked: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("image"), attachmentId: z.string() }),
  z.object({ id: z.string(), type: z.literal("file"), attachmentId: z.string() }),
  z.object({ id: z.string(), type: z.literal("toggle"), text: z.string().max(2000), body: z.string().max(20000), expanded: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("callout"), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.literal("table"), rows: z.array(z.array(z.string().max(2000)).max(20)).max(200) }),
  z.object({ id: z.string(), type: z.literal("embed"), url: z.string().url().max(2000) }),
  z.object({ id: z.string(), type: z.literal("bookmark"), url: z.string().url().max(2000) }),
  z.object({ id: z.string(), type: z.literal("toc") }),
]);

export const pageContentSchema = z.object({
  blocks: z.array(pageBlockSchema).max(2000),
});

export const createPageSchema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
});

export const updatePageMetaSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  status: z.enum(["in_progress", "handoff_pending", "done", "on_hold"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  parentId: z.string().nullable().optional(),
  orderKey: z.number().optional(),
});

export const updatePageContentSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  content: pageContentSchema,
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const attachmentInitSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}

export function isAllowedExtension(ext: string): boolean {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}
