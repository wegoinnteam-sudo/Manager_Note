import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppBindings } from "../types";
import { Errors } from "../lib/errors";
import { hmacSign } from "../lib/crypto";
import { createSession, deleteSession } from "../db/sessions";
import { upsertUserFromGoogleProfile, getUserByEmail } from "../db/users";
import { SESSION_COOKIE_NAME } from "../middleware/session";
import { CSRF_COOKIE_NAME } from "../middleware/csrf";
import { requireAuth } from "../middleware/rbac";
import { logActivity } from "../db/activityLog";
import { ensureDefaultTeam, ensureTeamMembership } from "../db/teams";

export const authRoute = new Hono<AppBindings>();

const OAUTH_STATE_COOKIE = "th_oauth_state";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function redirectUri(env: AppBindings["Bindings"]): string {
  if (!env.OAUTH_REDIRECT_BASE_URL) {
    throw Errors.internal("OAUTH_REDIRECT_BASE_URL이 설정되지 않았습니다.");
  }
  return `${env.OAUTH_REDIRECT_BASE_URL}/api/auth/google/callback`;
}

function parseAllowedEmails(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

authRoute.get("/google/login", async (c) => {
  if (!c.env.GOOGLE_OAUTH_CLIENT_ID) {
    throw Errors.internal("GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다.");
  }
  const state = crypto.randomUUID();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri(c.env),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
});

authRoute.get("/google/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    throw Errors.badRequest("로그인 요청이 유효하지 않습니다. 다시 시도해주세요.");
  }
  if (!c.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw Errors.internal("GOOGLE_OAUTH_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  if (!c.env.SESSION_SECRET) {
    throw Errors.internal("SESSION_SECRET이 설정되지 않았습니다.");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri(c.env),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw Errors.upstream("Google 로그인 토큰 교환에 실패했습니다.");
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userinfoRes.ok) throw Errors.upstream("Google 사용자 정보 조회에 실패했습니다.");
  const profile = (await userinfoRes.json()) as {
    email: string;
    email_verified: boolean;
    name: string;
    picture?: string;
  };

  if (!profile.email_verified) {
    throw Errors.forbidden("이메일이 확인되지 않은 Google 계정입니다.");
  }

  const email = profile.email.toLowerCase();
  const existingUser = await getUserByEmail(c.env.DB, email);

  // A user already provisioned in D1 (via prior login, or admin invite) may
  // always log in. A brand-new email is only allowed in if it is present in
  // the bootstrap GOOGLE_ALLOWED_EMAILS env var — this is what lets the
  // very first admin log in before any DB row exists, while every invite
  // after that is managed at runtime via the admin API, not redeploys.
  if (!existingUser) {
    const allowed = parseAllowedEmails(c.env.GOOGLE_ALLOWED_EMAILS || "");
    if (!allowed.has(email)) {
      throw Errors.forbidden("이 팀에 초대되지 않은 이메일입니다. 관리자에게 문의하세요.");
    }
  } else if (!existingUser.is_active) {
    throw Errors.forbidden("비활성화된 계정입니다. 관리자에게 문의하세요.");
  }

  const initialAdmins = parseAllowedEmails(c.env.GOOGLE_INITIAL_ADMIN_EMAILS || "");
  const defaultRole = !existingUser && initialAdmins.has(email) ? "admin" : "viewer";

  const user = await upsertUserFromGoogleProfile(
    c.env.DB,
    { email, name: profile.name, avatarUrl: profile.picture ?? null },
    defaultRole,
  );

  const team = await ensureDefaultTeam(c.env.DB, c.env);
  await ensureTeamMembership(c.env.DB, team.id, user.id, user.role);

  const session = await createSession(c.env.DB, user.id);
  const signature = await hmacSign(c.env.SESSION_SECRET, session.id);
  setCookie(c, SESSION_COOKIE_NAME, `${session.id}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  setCookie(c, CSRF_COOKIE_NAME, crypto.randomUUID(), {
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  await logActivity(c.env.DB, { teamId: team.id, pageId: null, actorId: user.id, action: "auth.login" });

  return c.redirect("/", 302);
});

authRoute.post("/logout", requireAuth, async (c) => {
  const raw = getCookie(c, SESSION_COOKIE_NAME);
  if (raw) {
    const [sessionId] = raw.split(".");
    if (sessionId) await deleteSession(c.env.DB, sessionId);
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});
