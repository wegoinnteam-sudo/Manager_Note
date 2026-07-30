import type { Env } from "../types";
import type { PageCategoryDTO } from "../../shared/types";
import { newId } from "../lib/ids";

const DEFAULTS = [
  ["reception", "Reception", "#2563eb"],
  ["cleaning", "Cleaning", "#16a34a"],
  ["operations", "운영(기타)", "#6b7280"],
  ["wegoinn2", "Wegoinn 2.0", "#ea580c"],
  ["marketing", "Marketing", "#9333ea"],
] as const;

async function ensureDefaults(db: Env["DB"], teamId: string) {
  await db.batch(
    DEFAULTS.map(([key, label, color], index) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO page_categories (key, team_id, label, color, order_key) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(key, teamId, label, color, index),
    ),
  );
}

export async function listPageCategories(db: Env["DB"], teamId: string): Promise<PageCategoryDTO[]> {
  await ensureDefaults(db, teamId);
  const { results } = await db
    .prepare("SELECT key, label, color, order_key FROM page_categories WHERE team_id = ?1 ORDER BY order_key, created_at")
    .bind(teamId)
    .all<{ key: string; label: string; color: string; order_key: number }>();
  return (results ?? []).map((row) => ({ key: row.key, label: row.label, color: row.color, orderKey: row.order_key }));
}

export async function createPageCategory(
  db: Env["DB"],
  teamId: string,
  label: string,
  color: string,
): Promise<PageCategoryDTO> {
  await ensureDefaults(db, teamId);
  const key = newId("category");
  const max = await db
    .prepare("SELECT COALESCE(MAX(order_key), -1) AS value FROM page_categories WHERE team_id = ?1")
    .bind(teamId)
    .first<{ value: number }>();
  const orderKey = (max?.value ?? -1) + 1;
  await db
    .prepare("INSERT INTO page_categories (key, team_id, label, color, order_key) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(key, teamId, label, color, orderKey)
    .run();
  return { key, label, color, orderKey };
}

// Removing a category never deletes pages — anything filed under it just
// falls back to "카테고리 없음" (category = NULL), same as any other page
// without a category.
export async function deletePageCategory(db: Env["DB"], teamId: string, key: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE pages SET category = NULL WHERE team_id = ?1 AND category = ?2").bind(teamId, key),
    db.prepare("DELETE FROM page_categories WHERE team_id = ?1 AND key = ?2").bind(teamId, key),
  ]);
}

export async function reorderPageCategories(db: Env["DB"], teamId: string, orderedKeys: string[]): Promise<void> {
  await db.batch(
    orderedKeys.map((key, index) =>
      db.prepare("UPDATE page_categories SET order_key = ?1 WHERE team_id = ?2 AND key = ?3").bind(index, teamId, key),
    ),
  );
}
