import type { Env } from "../types";

export async function getEncryptedSetting(db: Env["DB"], key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT encrypted_value FROM app_settings WHERE key = ?1")
    .bind(key)
    .first<{ encrypted_value: string }>();
  return row?.encrypted_value ?? null;
}

export async function setEncryptedSetting(db: Env["DB"], key: string, encryptedValue: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, encrypted_value, updated_at)
       VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(key) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, encryptedValue)
    .run();
}
