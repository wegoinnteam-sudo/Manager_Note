import type { Env } from "../types";
import { newId, nowIso } from "../lib/ids";

export interface SecretValueRow {
  id: string;
  team_id: string;
  page_id: string;
  block_id: string;
  value: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSecretValue(
  db: Env["DB"],
  teamId: string,
  pageId: string,
  blockId: string,
): Promise<SecretValueRow | null> {
  const row = await db
    .prepare("SELECT * FROM sensitive_values WHERE team_id = ?1 AND page_id = ?2 AND block_id = ?3")
    .bind(teamId, pageId, blockId)
    .first<SecretValueRow>();
  return row ?? null;
}

export async function setSecretValue(
  db: Env["DB"],
  params: { teamId: string; pageId: string; blockId: string; value: string; userId: string },
): Promise<SecretValueRow> {
  const existing = await getSecretValue(db, params.teamId, params.pageId, params.blockId);
  const now = nowIso();

  if (existing) {
    await db
      .prepare("UPDATE sensitive_values SET value = ?1, updated_by = ?2, updated_at = ?3 WHERE id = ?4")
      .bind(params.value, params.userId, now, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO sensitive_values (id, team_id, page_id, block_id, value, created_by, updated_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?7)`,
      )
      .bind(newId("secret"), params.teamId, params.pageId, params.blockId, params.value, params.userId, now)
      .run();
  }

  const saved = await getSecretValue(db, params.teamId, params.pageId, params.blockId);
  if (!saved) throw new Error("민감정보 저장에 실패했습니다.");
  return saved;
}
