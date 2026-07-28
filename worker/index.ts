import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppBindings, Env } from "./types";
import { sessionMiddleware } from "./middleware/session";
import { csrfMiddleware } from "./middleware/csrf";
import { securityHeaders } from "./middleware/securityHeaders";
import { rateLimit } from "./middleware/rateLimit";
import { AppError } from "./lib/errors";
import { meRoute } from "./routes/me";
import { pagesRoute } from "./routes/pages";
import { attachmentsRoute } from "./routes/attachments";
import { searchRoute } from "./routes/search";
import { driveRoute } from "./routes/drive";
import { authRoute } from "./routes/auth";
import { adminRoute } from "./routes/admin";
import { teamRoute } from "./routes/team";
import { presenceRoute } from "./routes/presence";
import { runDriveSync } from "./drive/sync";
import { ensureDefaultTeam } from "./db/teams";

export { PresenceRoom } from "./presence/PresenceRoom";

const app = new Hono<AppBindings>();

app.use("*", securityHeaders);
app.use("/api/*", sessionMiddleware);
app.use("/api/*", rateLimit(120));
app.use("/api/*", csrfMiddleware);

app.route("/api/auth", authRoute);
app.route("/api/me", meRoute);
app.route("/api/pages", pagesRoute);
app.route("/api/attachments", attachmentsRoute);
app.route("/api/search", searchRoute);
app.route("/api/drive", driveRoute);
app.route("/api/admin", adminRoute);
app.route("/api/team", teamRoute);
app.route("/api/presence", presenceRoute);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as any);
  }
  if (err instanceof ZodError) {
    return c.json({ error: "bad_request", message: "입력값이 올바르지 않습니다.", details: err.issues }, 400);
  }
  // Never leak internal error details (stack traces, secrets) to the client.
  console.error("Unhandled worker error:", err);
  return c.json({ error: "internal_error", message: "서버 오류가 발생했습니다." }, 500);
});

// Anything not matched under /api/* falls through to the static frontend
// build (Workers Static Assets), which itself falls back to index.html for
// client-side routing (see `not_found_handling` in wrangler.toml).
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const team = await ensureDefaultTeam(env.DB, env);
    ctx.waitUntil(runDriveSync(env, team.id, "cron"));
  },
} satisfies ExportedHandler<Env>;
