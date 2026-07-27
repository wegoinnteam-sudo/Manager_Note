import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireRole } from "../middleware/rbac";
import { runDriveSync } from "../drive/sync";
import { getSyncState, listSyncLogs } from "../db/driveSync";

export const driveRoute = new Hono<AppBindings>();

driveRoute.post("/sync", requireRole("editor"), async (c) => {
  const result = await runDriveSync(c.env, c.var.teamId, "manual");
  return c.json(result);
});

driveRoute.get("/sync/status", requireRole("viewer"), async (c) => {
  const [state, logs] = await Promise.all([
    getSyncState(c.env.DB, c.var.teamId),
    listSyncLogs(c.env.DB, c.var.teamId, 20),
  ]);
  return c.json({ state, logs });
});
