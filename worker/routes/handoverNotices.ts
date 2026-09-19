import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import { HANDOVER_CATEGORIES } from "../../shared/types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import { createHandoverNotice, listHandoverNotices, setHandoverNoticeDone } from "../db/handoverNotices";

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
  const input = setDoneSchema.parse(await c.req.json());
  const notice = await setHandoverNoticeDone(c.env.DB, c.var.teamId, c.req.param("id"), {
    isDone: input.isDone,
    completedBy: input.isDone ? input.completedBy! : null,
  });
  if (!notice) throw Errors.notFound("인수인계 항목을 찾을 수 없습니다.");
  return c.json(notice);
});
