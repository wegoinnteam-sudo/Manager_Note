import type { Env, Role } from "../types";
import { newId, nowIso } from "../lib/ids";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: Role;
  is_active: number;
  color: string | null;
}

export async function getUserByEmail(db: Env["DB"], email: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, name, avatar_url, role, is_active, color FROM users WHERE email = ?1")
    .bind(email.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

export async function getUserById(db: Env["DB"], id: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT id, email, name, avatar_url, role, is_active, color FROM users WHERE id = ?1")
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

/**
 * Creates the user on first successful Google login, or refreshes their
 * profile fields. Role is only set on first insert (default viewer, or
 * admin if the email is in GOOGLE_ALLOWED_EMAILS as an initial admin).
 */
export async function upsertUserFromGoogleProfile(
  db: Env["DB"],
  profile: { email: string; name: string; avatarUrl: string | null },
  defaultRole: Role,
): Promise<UserRow> {
  const existing = await getUserByEmail(db, profile.email);
  if (existing) {
    await db
      .prepare("UPDATE users SET name = ?1, avatar_url = ?2, updated_at = ?3 WHERE id = ?4")
      .bind(profile.name, profile.avatarUrl, nowIso(), existing.id)
      .run();
    return { ...existing, name: profile.name, avatar_url: profile.avatarUrl };
  }
  const id = newId("user");
  await db
    .prepare(
      "INSERT INTO users (id, email, name, avatar_url, role) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id, profile.email.toLowerCase(), profile.name, profile.avatarUrl, defaultRole)
    .run();
  return {
    id,
    email: profile.email.toLowerCase(),
    name: profile.name,
    avatar_url: profile.avatarUrl,
    role: defaultRole,
    is_active: 1,
    color: null,
  };
}

/** Admin-driven invite: pre-provisions a user row before they ever log in. */
export async function inviteUser(db: Env["DB"], email: string, role: Role): Promise<UserRow> {
  const normalized = email.toLowerCase().trim();
  const existing = await getUserByEmail(db, normalized);
  if (existing) return existing;
  const id = newId("user");
  await db
    .prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, normalized, normalized.split("@")[0], role)
    .run();
  return { id, email: normalized, name: normalized.split("@")[0], avatar_url: null, role, is_active: 1, color: null };
}

export async function setUserActive(db: Env["DB"], userId: string, isActive: boolean): Promise<void> {
  await db
    .prepare("UPDATE users SET is_active = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(isActive ? 1 : 0, nowIso(), userId)
    .run();
}

export async function updateUserRole(db: Env["DB"], userId: string, role: Role): Promise<void> {
  await db
    .prepare("UPDATE users SET role = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(role, nowIso(), userId)
    .run();
}

/** Self-service: lets a user pick their own calendar color (or null to reset to the default). */
export async function updateUserColor(db: Env["DB"], userId: string, color: string | null): Promise<void> {
  await db
    .prepare("UPDATE users SET color = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(color, nowIso(), userId)
    .run();
}

export const SYSTEM_USER_ID = "user_system_drive_sync";
export const PUBLIC_EDITOR_USER_ID = "user_public_editor";

/** Shared editor identity used when the app is intentionally running without login. */
export async function ensurePublicEditor(db: Env["DB"]): Promise<UserRow> {
  const existing = await getUserById(db, PUBLIC_EDITOR_USER_ID);
  if (existing) return existing;

  await db
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, name, role, is_active) VALUES (?1, ?2, ?3, 'editor', 1)",
    )
    .bind(PUBLIC_EDITOR_USER_ID, "public-editor@system.local", "공용 편집자")
    .run();

  return {
    id: PUBLIC_EDITOR_USER_ID,
    email: "public-editor@system.local",
    name: "공용 편집자",
    avatar_url: null,
    role: "editor",
    is_active: 1,
    color: null,
  };
}

/** Attribution for attachments/pages created by the background Drive sync, not a person. */
export async function ensureSystemUser(db: Env["DB"]): Promise<UserRow> {
  const existing = await getUserById(db, SYSTEM_USER_ID);
  if (existing) return existing;
  await db
    .prepare(
      "INSERT INTO users (id, email, name, role, is_active) VALUES (?1, ?2, ?3, 'viewer', 0)",
    )
    .bind(SYSTEM_USER_ID, "drive-sync@system.local", "Drive 동기화")
    .run();
  return {
    id: SYSTEM_USER_ID,
    email: "drive-sync@system.local",
    name: "Drive 동기화",
    avatar_url: null,
    role: "viewer",
    is_active: 0,
    color: null,
  };
}

export async function listUsers(db: Env["DB"]): Promise<UserRow[]> {
  const { results } = await db
    .prepare("SELECT id, email, name, avatar_url, role, is_active, color FROM users ORDER BY name")
    .all<UserRow>();
  return results ?? [];
}
