import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";
import { searchAttachments, searchPages } from "../db/search";
import { toAttachmentDTO, toPageSummaryDTO } from "../lib/dto";

export const searchRoute = new Hono<AppBindings>();

searchRoute.use("*", requireAuth);

searchRoute.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ pages: [], attachments: [] });

  const [pages, attachments] = await Promise.all([
    searchPages(c.env.DB, c.var.teamId, q),
    searchAttachments(c.env.DB, c.var.teamId, q),
  ]);

  return c.json({
    pages: pages.map(toPageSummaryDTO),
    attachments: attachments.map(toAttachmentDTO),
  });
});
