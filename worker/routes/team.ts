import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";

export const teamRoute = new Hono<AppBindings>();

teamRoute.use("*", requireAuth);

teamRoute.get("/members", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.avatar_url, tm.role FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?1 AND u.is_active = 1
     ORDER BY u.name`,
  )
    .bind(c.var.teamId)
    .all<{ id: string; name: string; email: string; avatar_url: string | null; role: string }>();

  return c.json({
    members: (results ?? []).map((r) => ({ id: r.id, name: r.name, email: r.email, avatarUrl: r.avatar_url, role: r.role })),
  });
});
