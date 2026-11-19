import { Hono } from "hono";
import { cancellationInputSchema, type CancellationInput } from "../../shared/cancellations";
import type { AppBindings } from "../types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { Errors } from "../lib/errors";

export const cancellationsRoute = new Hono<AppBindings>();
cancellationsRoute.use("*", requireAuth);
cancellationsRoute.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  return requireRole("editor")(c, next);
});

const COLUMNS = `id, cancel_date AS cancelDate, reservation_number AS reservationNumber, guest_name AS guestName,
  check_in_date AS checkInDate, cancellation_rate AS cancellationRate, manager, reason, created_at AS createdAt`;
const visible = "id = ? AND team_id = ? AND deleted_at IS NULL";

const fields = (input: CancellationInput) => [
  input.cancelDate, input.reservationNumber, input.guestName, input.checkInDate,
  input.cancellationRate, input.manager, input.reason,
];

cancellationsRoute.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${COLUMNS} FROM cancellations WHERE team_id = ? AND deleted_at IS NULL ORDER BY cancel_date DESC, created_at DESC`,
  ).bind(c.var.teamId).all();
  return c.json({ records: rows.results });
});

cancellationsRoute.post("/", async (c) => {
  const input = cancellationInputSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO cancellations (id, team_id, cancel_date, reservation_number, guest_name,
    check_in_date, cancellation_rate, manager, reason, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.var.teamId, ...fields(input), c.var.user!.name, now, now).run();
  return c.json({ ...input, id, createdAt: now }, 201);
});

cancellationsRoute.patch("/:id", async (c) => {
  const input = cancellationInputSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare(`UPDATE cancellations SET cancel_date = ?, reservation_number = ?, guest_name = ?,
    check_in_date = ?, cancellation_rate = ?, manager = ?, reason = ?, updated_at = ? WHERE ${visible}`)
    .bind(...fields(input), new Date().toISOString(), c.req.param("id"), c.var.teamId).run();
  if (!result.meta.changes) throw Errors.notFound("취소내역을 찾을 수 없습니다.");
  return c.body(null, 204);
});

cancellationsRoute.delete("/:id", async (c) => {
  await c.env.DB.prepare(`UPDATE cancellations SET deleted_at = ? WHERE ${visible}`)
    .bind(new Date().toISOString(), c.req.param("id"), c.var.teamId).run();
  return c.body(null, 204);
});
