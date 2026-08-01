import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";
import { listGuestColors, setGuestColor } from "../db/guestColors";
import { hexColorSchema } from "../lib/validation";
import { z } from "zod";

export const guestColorsRoute = new Hono<AppBindings>();

guestColorsRoute.use("*", requireAuth);

guestColorsRoute.get("/", async (c) => {
  return c.json({ colors: await listGuestColors(c.env.DB, c.var.teamId) });
});

const setGuestColorSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColorSchema.nullable(),
});

guestColorsRoute.put("/", async (c) => {
  const body = setGuestColorSchema.parse(await c.req.json());
  await setGuestColor(c.env.DB, c.var.teamId, body.name, body.color);
  return c.json({ colors: await listGuestColors(c.env.DB, c.var.teamId) });
});
