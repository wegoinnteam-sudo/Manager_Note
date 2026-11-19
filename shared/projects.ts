import { z } from "zod";

const note = z.string().trim().max(4000);
const title = z.string().trim().min(1).max(200);
const date = z.string().date().or(z.literal(""));

export const projectSchema = z.object({
  title,
  owner: z.string().trim().max(60),
  dueDate: date,
  goal: note,
  expected: note,
  handover: note,
  verification: note,
  outcome: note,
  status: z.enum(["planned", "active", "paused", "finished"]),
});

export const taskSchema = z.object({
  title,
  assignee: z.string().trim().max(60),
  dueDate: date,
  priority: z.enum(["urgent", "high", "normal", "low"]),
  status: z.enum(["todo", "doing", "done"]),
  handover: note,
  verification: note,
  subtasks: z.array(z.object({ id: z.string().uuid(), title, done: z.boolean() })).max(50)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectTaskInput = z.infer<typeof taskSchema>;
export type Project = ProjectInput & { id: string; version: number };
export type ProjectTask = ProjectTaskInput & { id: string; version: number; completedBy: string | null; completedAt: string | null };
export type ProjectTaskUpdate = {
  id: string;
  taskId: string;
  author: string;
  createdAt: string;
  body: string;
  kind: "note" | "completion";
  photoName: string | null;
};
export type ProjectDetail = { project: Project; tasks: ProjectTask[]; updates: ProjectTaskUpdate[] };
