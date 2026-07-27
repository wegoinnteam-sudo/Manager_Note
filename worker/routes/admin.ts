import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../types";
import { requireRole } from "../middleware/rbac";
import { inviteUser, listUsers, setUserActive, updateUserRole } from "../db/users";
import { toUserDTO } from "../lib/dto";
import { logActivity } from "../db/activityLog";
import { Errors } from "../lib/errors";

export const adminRoute = new Hono<AppBindings>();

adminRoute.use("*", requireRole("admin"));

adminRoute.get("/users", async (c) => {
  const rows = await listUsers(c.env.DB);
  return c.json({ users: rows.map(toUserDTO) });
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

adminRoute.post("/users/invite", async (c) => {
  const body = inviteSchema.parse(await c.req.json());
  const user = await inviteUser(c.env.DB, body.email, body.role);
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: null,
    actorId: c.var.user!.id,
    action: "user.invited",
    metadata: { email: body.email, role: body.role },
  });
  return c.json(toUserDTO(user), 201);
});

const roleSchema = z.object({ role: z.enum(["admin", "editor", "viewer"]) });

adminRoute.patch("/users/:id/role", async (c) => {
  const body = roleSchema.parse(await c.req.json());
  if (c.req.param("id") === c.var.user!.id && body.role !== "admin") {
    throw Errors.badRequest("본인의 관리자 권한은 스스로 낮출 수 없습니다.");
  }
  await updateUserRole(c.env.DB, c.req.param("id"), body.role);
  await logActivity(c.env.DB, {
    teamId: c.var.teamId,
    pageId: null,
    actorId: c.var.user!.id,
    action: "user.role_changed",
    metadata: { userId: c.req.param("id"), role: body.role },
  });
  return c.json({ ok: true });
});

const activeSchema = z.object({ isActive: z.boolean() });

adminRoute.patch("/users/:id/active", async (c) => {
  const body = activeSchema.parse(await c.req.json());
  if (c.req.param("id") === c.var.user!.id) {
    throw Errors.badRequest("본인 계정은 스스로 비활성화할 수 없습니다.");
  }
  await setUserActive(c.env.DB, c.req.param("id"), body.isActive);
  return c.json({ ok: true });
});
