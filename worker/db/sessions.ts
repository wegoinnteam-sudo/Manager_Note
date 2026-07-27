import type { Env } from "../types";
import { newId } from "../lib/ids";

const SESSION_TTL_DAYS = 30;

export async function createSession(db: Env["DB"], userId: string): Promise<{ id: string; expiresAt: string }> {
  const id = newId("sess");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)")
    .bind(id, userId, expiresAt)
    .run();
  return { id, expiresAt };
}

export async function getSessionUserId(db: Env["DB"], sessionId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ user_id: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
    return null;
  }
  return row.user_id;
}

export async function deleteSession(db: Env["DB"], sessionId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
}
