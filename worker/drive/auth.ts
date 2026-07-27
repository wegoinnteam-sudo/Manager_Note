import type { Env } from "../types";
import { importRsaPrivateKey, rsaSignRs256, utf8ToBase64Url } from "../lib/crypto";
import { Errors } from "../lib/errors";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Per-isolate token cache. Workers isolates are reused across requests, so
// caching here meaningfully cuts down on token endpoint calls without any
// external storage. A cold isolate just re-fetches a token.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getDriveAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }

  const token =
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ? await fetchTokenViaServiceAccount(env)
      : env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN
        ? await fetchTokenViaRefreshToken(env)
        : null;

  if (!token) {
    throw Errors.internal(
      "Google Drive 인증이 구성되지 않았습니다. 서비스 계정 또는 OAuth 환경변수를 설정하세요.",
    );
  }

  cachedToken = token;
  return token.accessToken;
}

async function fetchTokenViaServiceAccount(env: Env): Promise<{ accessToken: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(JSON.stringify(claims))}`;
  const key = await importRsaPrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!);
  const signature = await rsaSignRs256(key, signingInput);
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw Errors.upstream(`Google 서비스 계정 토큰 발급 실패 (${res.status})`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}

async function fetchTokenViaRefreshToken(env: Env): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN!,
    }),
  });
  if (!res.ok) {
    throw Errors.upstream(`Google OAuth 토큰 갱신 실패 (${res.status})`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}
