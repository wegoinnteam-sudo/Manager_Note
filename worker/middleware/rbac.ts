import { createMiddleware } from "hono/factory";
import type { AppBindings, Role } from "../types";
import { Errors } from "../lib/errors";

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  if (!c.var.user) throw Errors.unauthorized();
  await next();
});

export function requireRole(min: Role) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.var.user;
    if (!user) throw Errors.unauthorized();
    if (ROLE_RANK[user.role] < ROLE_RANK[min]) {
      throw Errors.forbidden(`이 작업에는 ${min} 이상 권한이 필요합니다.`);
    }
    await next();
  });
}
