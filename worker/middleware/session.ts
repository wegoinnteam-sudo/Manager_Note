import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import type { AppBindings, AuthedUser } from "../types";
import { hmacVerify } from "../lib/crypto";
import { getSessionUserId } from "../db/sessions";
import { ensurePublicEditor, getUserById } from "../db/users";
import { ensureDefaultTeam, ensureTeamMembership } from "../db/teams";
import { CSRF_COOKIE_NAME } from "./csrf";

export const SESSION_COOKIE_NAME = "th_session";

/**
 * Resolves the session cookie (if any) into c.var.user. Never throws for a
 * missing/invalid session — routes that require auth call requireAuth().
 * This is the single place that re-validates identity server-side; the
 * frontend never decides who is logged in.
 */
export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  c.set("user", null);
  c.set("teamId", "");

  const raw = getCookie(c, SESSION_COOKIE_NAME);
  const secret = c.env.SESSION_SECRET;
  if (raw && secret) {
    const [sessionId, signature] = raw.split(".");
    if (sessionId && signature && (await hmacVerify(secret, sessionId, signature))) {
      const userId = await getSessionUserId(c.env.DB, sessionId);
      if (userId) {
        const userRow = await getUserById(c.env.DB, userId);
        if (userRow && userRow.is_active) {
          const authed: AuthedUser = {
            id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            avatarUrl: userRow.avatar_url,
            role: userRow.role,
          };
          c.set("user", authed);
        }
      }
    }
  }

  // This app intentionally runs as a shared note workspace without login.
  // Keep honoring an existing session for backwards compatibility, but
  // otherwise give every visitor the shared editor identity.
  if (!c.var.user) {
    const publicEditor = await ensurePublicEditor(c.env.DB);
    c.set("user", {
      id: publicEditor.id,
      email: publicEditor.email,
      name: publicEditor.name,
      avatarUrl: publicEditor.avatar_url,
      role: publicEditor.role,
    });

    if (!getCookie(c, CSRF_COOKIE_NAME)) {
      setCookie(c, CSRF_COOKIE_NAME, crypto.randomUUID(), {
        httpOnly: false,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }
  }

  const user = c.var.user;
  if (user) {
    const team = await ensureDefaultTeam(c.env.DB, c.env);
    await ensureTeamMembership(c.env.DB, team.id, user.id, user.role);
    c.set("teamId", team.id);
  }

  await next();
});
