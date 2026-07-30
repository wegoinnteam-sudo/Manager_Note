import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { createPageCategory, listPageCategories } from "../db/pageCategories";

export const pageCategoriesRoute = new Hono<AppBindings>();

pageCategoriesRoute.use("*", requireAuth);

pageCategoriesRoute.get("/", async (c) => {
  return c.json({ categories: await listPageCategories(c.env.DB, c.var.teamId) });
});

pageCategoriesRoute.post("/", requireRole("editor"), async (c) => {
  const body = z
    .object({
      label: z.string().trim().min(1).max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6b7280"),
    })
    .parse(await c.req.json());
  return c.json(await createPageCategory(c.env.DB, c.var.teamId, body.label, body.color), 201);
});
