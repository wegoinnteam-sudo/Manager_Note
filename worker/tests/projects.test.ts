import { Hono } from "hono";
import { expect, it } from "vitest";
import type { Project, ProjectDetail } from "../../shared/projects";
import { PUBLIC_EDITOR_USER_ID } from "../db/users";
import { AppError } from "../lib/errors";
import { projectsRoute } from "../routes/projects";
import type { AppBindings, Env } from "../types";
import { createTestDb, type FakeD1 } from "./helpers/fakeD1";

it("shares ordered project tasks, records automatic completion, and rejects stale or out-of-team edits", async () => {
  const db: FakeD1 = createTestDb();
  for (const team of ["test", "other"]) {
    await db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").bind(team, team).run();
  }
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("teamId", c.req.header("test-team") ?? "test");
    c.set("user", { id: PUBLIC_EDITOR_USER_ID, name: "공용 편집자", role: "editor", email: "", avatarUrl: null });
    await next();
  });
  app.route("/projects", projectsRoute);
  app.onError((error) => error instanceof AppError ? new Response(error.message, { status: error.status }) : Promise.reject(error));

  const env = {
    DB: {
      prepare: db.prepare.bind(db),
      batch: (statements: ReturnType<FakeD1["prepare"]>[]) => Promise.all(statements.map((statement) => statement.all())),
    },
  } as unknown as Env;
  const request = (path: string, method = "GET", body?: object, team = "test") => app.request(
    `/projects${path}`, { method, body: body && JSON.stringify(body), headers: { "test-team": team } }, env,
  );
  const created = await request("", "POST", {
    title: "717호 객실 오픈", owner: "Jane", dueDate: "2026-11-30", goal: "객실 오픈",
    expected: "", handover: "객실 키 인계", verification: "설비 점검", outcome: "", status: "active",
  });
  expect(created.status).toBe(201);
  const path = `/${((await created.json()) as Project).id}`;
  const taskInput = {
    title: "객실 시설 준비", assignee: "Justin", dueDate: "2026-11-20", priority: "urgent", status: "todo",
    handover: "", verification: "", subtasks: [{ id: crypto.randomUUID(), title: "에어컨 점검", done: false }],
    author: "Justin",
  };
  expect((await request(`${path}/tasks`, "POST", taskInput)).status).toBe(204);
  expect((await request(`${path}/tasks`, "POST", { ...taskInput, title: "판매 시작", subtasks: [] })).status).toBe(204);
  const detail = async () => (await (await request(path)).json()) as ProjectDetail;
  const [first, second] = (await detail()).tasks;
  const taskPath = `${path}/tasks/${first.id}`;
  const completedInput = { ...first, author: "Jane", subtasks: first.subtasks.map((item) => ({ ...item, done: true })) };
  expect((await request(taskPath, "PATCH", completedInput, "other")).status).toBe(409);
  expect((await request(path, "GET", undefined, "other")).status).toBe(404);
  expect((await request(taskPath, "PATCH", completedInput)).status).toBe(204);
  expect((await request(taskPath, "PATCH", completedInput)).status).toBe(409);
  let current = await detail();
  expect(current.tasks[0]).toMatchObject({ status: "done", completedBy: "Jane" });
  expect(current.tasks[0].completedAt).toBeTruthy();
  expect(current.updates).toMatchObject([{ taskId: first.id, kind: "completion", author: "Jane" }]);

  const order = { before: [first.id, second.id], after: [second.id, first.id] };
  expect((await request(`${path}/order`, "PATCH", order)).status).toBe(204);
  expect((await request(`${path}/order`, "PATCH", order)).status).toBe(409);
  current = await detail();
  expect(current.tasks.map(({ id }) => id)).toEqual(order.after);
  expect((await request(taskPath, "PATCH", { ...current.tasks[1], author: "Justin", subtasks: first.subtasks })).status).toBe(204);
  current = await detail();
  expect(current.tasks[1]).toMatchObject({ status: "todo", completedAt: null });
  expect(current.updates).toHaveLength(1);
  expect((await request(`${taskPath}/comments`, "POST", { author: "Justin", body: "재점검 예정" })).status).toBe(204);
  expect((await detail()).updates).toHaveLength(2);

  expect((await request(path, "DELETE")).status).toBe(204);
  expect((await request(path)).status).toBe(404);
});
