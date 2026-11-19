import { Hono, type Context } from "hono";
import { z } from "zod";
import { projectSchema, taskSchema, type Project, type ProjectTask, type ProjectTaskInput } from "../../shared/projects";
import type { AppBindings } from "../types";
import { requireAuth, requireRole } from "../middleware/rbac";
import { PUBLIC_EDITOR_USER_ID } from "../db/users";
import { Errors } from "../lib/errors";
import { getTeamFolderIds } from "../drive/folders";
import { deleteFilePermanently, getFileMediaStream, uploadFileStreaming } from "../drive/client";

export const projectsRoute = new Hono<AppBindings>();
projectsRoute.use("*", requireAuth);
projectsRoute.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  return requireRole("editor")(c, next);
});

type ProjectRow = { id: string; data: string; version: number };
type TaskRow = ProjectRow & { completed_by: string | null; completed_at: string | null };
const authorSchema = z.string().trim().min(1).max(60);
function authorName(c: Context<AppBindings>, guestName: string) {
  return c.var.user!.id === PUBLIC_EDITOR_USER_ID ? guestName : c.var.user!.name;
}

function decodedHeader(c: Context<AppBindings>, name: string) {
  try {
    return decodeURIComponent(c.req.header(name) ?? "");
  } catch {
    throw Errors.badRequest("첨부 파일 정보가 올바르지 않습니다.");
  }
}

const versionSchema = z.number().int().positive();

function toProject(row: ProjectRow): Project {
  return { ...projectSchema.parse(JSON.parse(row.data)), id: row.id, version: row.version };
}

function toTask(row: TaskRow): ProjectTask {
  return {
    ...taskSchema.parse(JSON.parse(row.data)), id: row.id, version: row.version,
    completedBy: row.completed_by, completedAt: row.completed_at,
  };
}

function normalizeTask(task: ProjectTaskInput): ProjectTaskInput {
  if (!task.subtasks.length) return task;
  const status = task.subtasks.every((item) => item.done) ? "done"
    : task.status === "doing" || task.subtasks.some((item) => item.done) ? "doing" : "todo";
  return { ...task, status };
}

const visibleProject = "id = ? AND team_id = ? AND deleted_at IS NULL";
const visibleTask = `id = ? AND deleted_at IS NULL AND project_id IN (SELECT id FROM projects WHERE ${visibleProject})`;

projectsRoute.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, data, version FROM projects WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id",
  ).bind(c.var.teamId).all<ProjectRow>();
  return c.json(rows.results.map(toProject));
});

projectsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [project, tasks, updates] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT id, data, version FROM projects WHERE ${visibleProject}`).bind(id, c.var.teamId),
    c.env.DB.prepare(`SELECT * FROM project_tasks WHERE deleted_at IS NULL
      AND project_id IN (SELECT id FROM projects WHERE ${visibleProject}) ORDER BY position, id`).bind(id, c.var.teamId),
    c.env.DB.prepare(`SELECT u.id, u.task_id AS taskId, u.author, u.body, u.kind, u.photo_name AS photoName, u.created_at AS createdAt
      FROM project_task_updates u JOIN project_tasks t ON t.id = u.task_id
      WHERE t.deleted_at IS NULL AND t.project_id IN (SELECT id FROM projects WHERE ${visibleProject})
      ORDER BY u.created_at, u.id`).bind(id, c.var.teamId),
  ]);
  if (!project.results[0]) throw Errors.notFound("프로젝트를 찾을 수 없습니다.");
  return c.json({ project: toProject(project.results[0] as ProjectRow), tasks: (tasks.results as TaskRow[]).map(toTask), updates: updates.results });
});

projectsRoute.post("/", async (c) => {
  const input = projectSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO projects (id, team_id, data) VALUES (?, ?, ?)")
    .bind(id, c.var.teamId, JSON.stringify(input)).run();
  return c.json({ ...input, id, version: 1 }, 201);
});

projectsRoute.patch("/:id", async (c) => {
  const { version, ...input } = projectSchema.extend({ version: versionSchema }).parse(await c.req.json());
  const result = await c.env.DB.prepare(`UPDATE projects SET data = ?, version = version + 1 WHERE ${visibleProject} AND version = ?`)
    .bind(JSON.stringify(input), c.req.param("id"), c.var.teamId, version).run();
  if (!result.meta.changes) throw Errors.conflict();
  return c.body(null, 204);
});

projectsRoute.delete("/:id", async (c) => {
  await c.env.DB.prepare(`UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE ${visibleProject}`)
    .bind(c.req.param("id"), c.var.teamId).run();
  return c.body(null, 204);
});

projectsRoute.post("/:id/tasks", async (c) => {
  const { author, ...fields } = taskSchema.extend({ author: authorSchema }).parse(await c.req.json());
  const input = normalizeTask(fields);
  const result = await c.env.DB.prepare(`INSERT INTO project_tasks (id, project_id, data, position, completed_by, completed_at)
    SELECT ?, p.id, ?, COALESCE((SELECT MAX(position) FROM project_tasks WHERE project_id = p.id), 0) + 1, ?, ?
    FROM projects p WHERE ${visibleProject}`)
    .bind(crypto.randomUUID(), JSON.stringify(input), input.status === "done" ? authorName(c, author) : null,
      input.status === "done" ? new Date().toISOString() : null, c.req.param("id"), c.var.teamId).run();
  if (!result.meta.changes) throw Errors.notFound("프로젝트를 찾을 수 없습니다.");
  return c.body(null, 204);
});

projectsRoute.patch("/:id/tasks/:taskId", async (c) => {
  const { author, version, ...fields } = taskSchema.extend({ author: authorSchema, version: versionSchema }).parse(await c.req.json());
  const input = normalizeTask(fields);
  const done = input.status === "done";
  const result = await c.env.DB.prepare(`UPDATE project_tasks SET data = ?, version = version + 1,
    completed_by = CASE WHEN ? THEN COALESCE(completed_by, ?) END,
    completed_at = CASE WHEN ? THEN COALESCE(completed_at, ?) END
    WHERE ${visibleTask} AND version = ?`)
    .bind(JSON.stringify(input), Number(done), authorName(c, author), Number(done), new Date().toISOString(),
      c.req.param("taskId"), c.req.param("id"), c.var.teamId, version).run();
  if (!result.meta.changes) throw Errors.conflict();
  return c.body(null, 204);
});

projectsRoute.delete("/:id/tasks/:taskId", async (c) => {
  await c.env.DB.prepare(`UPDATE project_tasks SET deleted_at = CURRENT_TIMESTAMP WHERE ${visibleTask}`)
    .bind(c.req.param("taskId"), c.req.param("id"), c.var.teamId).run();
  return c.body(null, 204);
});

projectsRoute.patch("/:id/order", async (c) => {
  const { before, after } = z.object({
    before: z.array(z.string().uuid()), after: z.array(z.string().uuid()),
  }).refine(({ before, after }) => before.length === after.length &&
    new Set(before).size === before.length && new Set(after).size === after.length &&
    before.every((id) => after.includes(id))).parse(await c.req.json());
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(`WITH new_order AS MATERIALIZED (SELECT key, value FROM json_each(?)),
    current_order AS MATERIALIZED (
      SELECT json_group_array(id) AS ids FROM (
        SELECT id FROM project_tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id
      )
    )
    UPDATE project_tasks SET position = (SELECT key + 1 FROM new_order WHERE value = project_tasks.id)
    WHERE project_id IN (SELECT id FROM projects WHERE ${visibleProject})
    AND id IN (SELECT value FROM new_order) AND (SELECT ids FROM current_order) = ?`)
    .bind(JSON.stringify(after), id, id, c.var.teamId, JSON.stringify(before)).run();
  if (!result.meta.changes) throw Errors.conflict();
  return c.body(null, 204);
});

projectsRoute.post("/:id/tasks/:taskId/comments", async (c) => {
  const { author, body } = z.object({ author: authorSchema, body: z.string().trim().min(1).max(4000) }).parse(await c.req.json());
  const result = await c.env.DB.prepare(`INSERT INTO project_task_updates (id, task_id, author, body, created_at)
    SELECT ?, id, ?, ?, ? FROM project_tasks WHERE ${visibleTask}`)
    .bind(crypto.randomUUID(), authorName(c, author), body, new Date().toISOString(),
      c.req.param("taskId"), c.req.param("id"), c.var.teamId).run();
  if (!result.meta.changes) throw Errors.notFound("업무를 찾을 수 없습니다.");
  return c.body(null, 204);
});

projectsRoute.post("/:id/tasks/:taskId/photos", async (c) => {
  const scope = [c.req.param("taskId"), c.req.param("id"), c.var.teamId];
  const task = await c.env.DB.prepare(`SELECT id FROM project_tasks WHERE ${visibleTask}`).bind(...scope).first();
  if (!task) throw Errors.notFound("업무를 찾을 수 없습니다.");
  const author = authorSchema.parse(decodedHeader(c, "x-project-author"));
  const name = z.string().trim().min(1).max(255).parse(decodedHeader(c, "x-file-name"));
  const mimeType = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).parse(c.req.header("content-type"));
  const sizeBytes = Number(c.req.header("content-length"));
  if (sizeBytes > 15 * 1024 * 1024) throw Errors.payloadTooLarge();
  const body = c.req.raw.body;
  if (!body || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw Errors.badRequest("업로드할 사진이 없습니다.");

  const folders = await getTeamFolderIds(c.env);
  const file = await uploadFileStreaming(c.env, { name, mimeType, sizeBytes, body, parentFolderId: folders.Attachments });
  try {
    const result = await c.env.DB.prepare(`INSERT INTO project_task_updates
      (id, task_id, author, photo_name, photo_type, drive_file_id, created_at)
      SELECT ?, id, ?, ?, ?, ?, ? FROM project_tasks WHERE ${visibleTask}`)
      .bind(crypto.randomUUID(), authorName(c, author), name, mimeType, file.id, new Date().toISOString(), ...scope).run();
    if (!result.meta.changes) throw Errors.notFound("업무를 찾을 수 없습니다.");
  } catch (error) {
    await deleteFilePermanently(c.env, file.id).catch(() => console.warn("Project photo cleanup failed"));
    throw error;
  }
  return c.body(null, 204);
});

projectsRoute.get("/:id/photos/:photoId", async (c) => {
  const photo = await c.env.DB.prepare(`SELECT u.photo_type, u.drive_file_id
    FROM project_task_updates u JOIN project_tasks t ON t.id = u.task_id JOIN projects p ON p.id = t.project_id
    WHERE u.id = ? AND p.id = ? AND p.team_id = ? AND p.deleted_at IS NULL AND t.deleted_at IS NULL
    AND u.drive_file_id IS NOT NULL`).bind(c.req.param("photoId"), c.req.param("id"), c.var.teamId)
    .first<{ photo_type: string; drive_file_id: string }>();
  if (!photo) throw Errors.notFound("사진을 찾을 수 없습니다.");
  const response = await getFileMediaStream(c.env, photo.drive_file_id);
  return new Response(response.body, { headers: { "Content-Type": photo.photo_type, "Cache-Control": "private, no-cache" } });
});
