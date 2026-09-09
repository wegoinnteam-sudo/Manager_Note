import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";
import { Errors } from "../lib/errors";
import { ackActivity, ackAllActivity, listActivityFeed } from "../db/activityLog";
import { toActivityFeedItemDTO } from "../lib/dto";
import { ackActivitySchema } from "../lib/validation";

export const activityRoute = new Hono<AppBindings>();

activityRoute.use("*", requireAuth);

// Most visitors share one "공용 편집자" login (see worker/middleware/session.ts),
// so the viewer's real user id can't tell them apart from a teammate on
// another browser — every route here needs the display name the visitor
// typed locally (useGuestIdentity) to know "is this my own edit".
function requireGuestName(raw: string | undefined): string {
  const guestName = raw?.trim().slice(0, 60);
  if (!guestName) throw Errors.badRequest("guestName이 필요합니다.");
  return guestName;
}

// The "Wegoinn DB" bottom activity bar: recent edits by teammates, with a
// per-guest acked flag so each visitor can dismiss entries independently.
activityRoute.get("/", async (c) => {
  const guestName = requireGuestName(c.req.query("guestName"));
  const rows = await listActivityFeed(c.env.DB, c.var.teamId, { userId: c.var.user!.id, guestName });
  return c.json({ items: rows.map(toActivityFeedItemDTO) });
});

activityRoute.post("/ack-all", async (c) => {
  const body = ackActivitySchema.parse(await c.req.json());
  await ackAllActivity(c.env.DB, c.var.teamId, { userId: c.var.user!.id, guestName: body.guestName });
  return c.json({ ok: true });
});

activityRoute.post("/:id/ack", async (c) => {
  const body = ackActivitySchema.parse(await c.req.json());
  const ok = await ackActivity(c.env.DB, {
    activityId: c.req.param("id"),
    teamId: c.var.teamId,
    guestName: body.guestName,
  });
  if (!ok) throw Errors.notFound();
  return c.json({ ok: true });
});
