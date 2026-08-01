import { z } from "zod";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_TITLE_LENGTH } from "../../shared/types";
import type { PageContent } from "../../shared/types";

export const pageContentSchema: z.ZodType<PageContent> = z.lazy(() =>
  z.object({
    blocks: z.array(pageBlockSchema).max(2000),
  }),
);

export const pageBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.enum(["heading1", "heading2", "heading3", "paragraph"]), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.enum(["bulleted_list_item", "numbered_list_item"]), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.literal("checklist_item"), text: z.string().max(20000), checked: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({
    id: z.string(),
    type: z.literal("image"),
    attachmentId: z.string().optional(),
    url: z.string().url().max(2000).optional(),
    caption: z.string().max(300).optional(),
    width: z.number().min(10).max(100).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  }),
  z.object({ id: z.string(), type: z.literal("file"), attachmentId: z.string() }),
  z.object({ id: z.string(), type: z.literal("toggle"), text: z.string().max(2000), body: z.string().max(20000), expanded: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("callout"), text: z.string().max(20000) }),
  z.object({
    id: z.string(),
    type: z.literal("table"),
    rows: z.array(z.array(z.string().max(2000)).max(20)).max(200),
    colWidths: z.array(z.number().min(20).max(2000)).max(20).optional(),
    cellStyles: z
      .record(
        z.string(),
        z.object({
          color: z.string().max(20).optional(),
          bg: z.string().max(20).optional(),
          fontSize: z.enum(["sm", "md", "lg"]).optional(),
        }),
      )
      .optional(),
  }),
  z.object({ id: z.string(), type: z.literal("embed"), url: z.string().url().max(2000) }),
  z.object({ id: z.string(), type: z.literal("bookmark"), url: z.string().url().max(2000) }),
  z.object({ id: z.string(), type: z.literal("toc") }),
  z.object({ id: z.string(), type: z.literal("page_link"), pageId: z.string() }),
  z.object({ id: z.string(), type: z.literal("columns"), columns: z.array(z.string().max(20000)).min(2).max(5) }),
  z.object({
    id: z.string(),
    type: z.literal("database_view"),
    view: z.enum(["table", "board", "gallery", "calendar", "timeline", "chart", "list"]),
    name: z.string().max(200).optional(),
    properties: z
      .array(
        z.enum([
          "status",
          "category",
          "description",
          "tags",
          "assigneeId",
          "dueDate",
          "updatedAt",
          "overdue",
          "daysRemaining",
          "subItems",
        ]),
      )
      .optional(),
    filter: z
      .object({
        field: z.enum(["status", "category", "description", "tags", "assigneeId", "dueDate", "updatedAt", "overdue", "daysRemaining", "subItems"]),
        op: z.enum(["eq", "neq", "contains", "notContains", "isEmpty", "isNotEmpty"]),
        value: z.string().max(200).optional(),
      })
      .nullable()
      .optional(),
    sort: z
      .object({
        field: z.enum(["title", "status", "assigneeId", "dueDate", "updatedAt"]),
        direction: z.enum(["asc", "desc"]),
      })
      .nullable()
      .optional(),
    groupBy: z.enum(["status", "category", "assigneeId", "none"]).optional(),
    sourcePageId: z.string().optional(),
    locked: z.boolean().optional(),
    templates: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(100),
          title: z.string().max(300),
          status: z.enum(["in_progress", "handoff_pending", "done", "on_hold"]).optional(),
          assigneeId: z.string().nullable().optional(),
          dueDate: z.string().nullable().optional(),
          content: pageContentSchema,
        }),
      )
      .max(30)
      .optional(),
    showSubItems: z.boolean().optional(),
    calendarSize: z.number().min(48).max(240).optional(),
    calendarWidth: z.number().min(0).max(6000).optional(),
    calendarOffset: z.number().min(-6000).max(6000).optional(),
  }),
  z.object({ id: z.string(), type: z.literal("chart") }),
  z.object({
    id: z.string(),
    type: z.literal("button"),
    label: z.string().max(60),
    templateKey: z.enum(["meeting_notes", "handoff_note", "emergency_manual", "group_contract", "room_repair", "event_report"]),
  }),
  z.object({ id: z.string(), type: z.literal("form"), formKey: z.enum(["leave_request", "repair_request", "purchase_request"]) }),
  z.object({ id: z.string(), type: z.literal("quote"), text: z.string().max(20000) }),
  z.object({ id: z.string(), type: z.literal("code"), text: z.string().max(50000), language: z.string().max(50).optional() }),
  z.object({ id: z.string(), type: z.literal("equation"), text: z.string().max(10000) }),
  // Deliberately no `value` field here — the real value never travels
  // through the bulk page-content save path. See worker/routes/secrets.ts.
  z.object({ id: z.string(), type: z.literal("secret"), label: z.string().max(200) }),
  z.object({ id: z.string(), type: z.literal("breadcrumb") }),
]);

export const secretValueSchema = z.object({ value: z.string().min(1).max(1000) });

const pageCategorySchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().max(300);

export const createPageSchema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  category: pageCategorySchema.nullable().optional(),
  description: descriptionSchema.nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  orderKey: z.number().optional(),
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const updatePageMetaSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  status: z.enum(["in_progress", "handoff_pending", "done", "on_hold"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  parentId: z.string().nullable().optional(),
  orderKey: z.number().optional(),
  textColor: hexColorSchema.nullable().optional(),
  highlightColor: hexColorSchema.nullable().optional(),
  category: pageCategorySchema.nullable().optional(),
  description: descriptionSchema.nullable().optional(),
});

export const updatePageContentSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  content: pageContentSchema,
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  authorName: z.string().trim().min(1).max(60).optional(),
});

export const createQuestionSchema = z.object({
  body: z.string().min(1).max(5000),
  blockId: z.string().max(100).nullable().optional(),
  blockLabel: z.string().max(300).nullable().optional(),
});

export const resolveQuestionSchema = z.object({ resolved: z.boolean() });

export const onboardingProgressSchema = z.object({
  blockId: z.string().min(1).max(100),
  completed: z.boolean(),
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
