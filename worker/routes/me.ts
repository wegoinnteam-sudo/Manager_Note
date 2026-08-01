import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware/rbac";
import { toUserDTO } from "../lib/dto";
import { getUserById, updateUserColor } from "../db/users";
import { Errors } from "../lib/errors";
import { updateMyColorSchema } from "../lib/validation";

export const meRoute = new Hono<AppBindings>();

meRoute.get("/", requireAuth, async (c) => {
  const user = c.var.user;
  if (!user) throw Errors.unauthorized();
  const row = await getUserById(c.env.DB, user.id);
  if (!row) throw Errors.unauthorized();
  return c.json(toUserDTO(row));
});

meRoute.patch("/color", requireAuth, async (c) => {
  const user = c.var.user;
  if (!user) throw Errors.unauthorized();
  const body = updateMyColorSchema.parse(await c.req.json());
  await updateUserColor(c.env.DB, user.id, body.color);
  const row = await getUserById(c.env.DB, user.id);
  if (!row) throw Errors.unauthorized();
  return c.json(toUserDTO(row));
});
