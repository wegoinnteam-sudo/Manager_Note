import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import { ackActivity, listActivityFeed } from "../db/activityLog";
import { toActivityFeedItemDTO } from "../lib/dto";

export const activityRoute = new Hono<AppBindings>();

activityRoute.use("*", requireAuth);

// The "Wegoinn DB" bottom activity bar: recent edits by teammates, with a
// per-user acked flag so each login can dismiss entries independently.
activityRoute.get("/", async (c) => {
  const rows = await listActivityFeed(c.env.DB, c.var.teamId, c.var.user!.id);
  return c.json({ items: rows.map(toActivityFeedItemDTO) });
});

activityRoute.post("/:id/ack", async (c) => {
  const ok = await ackActivity(c.env.DB, {
    activityId: c.req.param("id"),
    teamId: c.var.teamId,
    userId: c.var.user!.id,
  });
  if (!ok) throw Errors.notFound();
  return c.json({ ok: true });
});
