import { Hono } from "hono";
import { expect, it } from "vitest";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { cancellationsRoute } from "../routes/cancellations";
import type { AppBindings, Env } from "../types";
import { createTestDb, type FakeD1 } from "./helpers/fakeD1";

it("registers, edits and deletes cancellation records per team", async () => {
  const db: FakeD1 = createTestDb();
  for (const team of ["test", "other"]) await db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").bind(team, team).run();
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("teamId", c.req.header("test-team") ?? "test");
    c.set("user", { id: "u1", name: "Jane", role: (c.req.header("test-role") ?? "editor") as "editor", email: "", avatarUrl: null });
    await next();
  });
  app.route("/c", cancellationsRoute);
  app.onError((error) =>
    error instanceof AppError ? new Response(error.message, { status: error.status })
    : error instanceof ZodError ? new Response("bad", { status: 400 }) : Promise.reject(error));
  const env = { DB: { prepare: db.prepare.bind(db) } } as unknown as Env;
  const request = (path: string, method = "GET", body?: object, headers: Record<string, string> = {}) =>
    app.request(`/c${path}`, { method, body: body && JSON.stringify(body), headers }, env);
  const list = async (team = "test") => ((await (await request("", "GET", undefined, { "test-team": team })).json()) as { records: { id: string }[] }).records;

  const input = {
    cancelDate: "2026-11-19", reservationNumber: "202807035", guestName: "Fung Yee", checkInDate: "2026-12-01",
    cancellationRate: 100, manager: "Jane", reason: "항공편 취소",
  };
  expect((await request("", "POST", { ...input, cancellationRate: 0 })).status).toBe(400);
  expect((await request("", "POST", input, { "test-role": "viewer" })).status).toBe(403);
  const created = await request("", "POST", input);
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect(await list()).toMatchObject([{ id, ...input }]);
  expect(await list("other")).toEqual([]);

  expect((await request(`/${id}`, "PATCH", { ...input, cancellationRate: 50 }, { "test-team": "other" })).status).toBe(404);
  expect((await request(`/${id}`, "PATCH", { ...input, cancellationRate: 50 })).status).toBe(204);
  expect((await list())[0]).toMatchObject({ cancellationRate: 50 });

  expect((await request(`/${id}`, "DELETE")).status).toBe(204);
  expect(await list()).toEqual([]);
});
