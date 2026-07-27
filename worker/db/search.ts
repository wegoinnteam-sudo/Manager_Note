import type { Env } from "../types";
import type { PageRow } from "./pages";
import type { AttachmentRow } from "./attachments";

/**
 * MVP search: plain D1 LIKE queries. No external search service. Covers
 * page title/body, tags, status, assignee/author name, and file names.
 * Good enough at small-team scale; revisit only if query volume grows.
 */
export async function searchPages(db: Env["DB"], teamId: string, q: string): Promise<PageRow[]> {
  const like = `%${q}%`;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT p.* FROM pages p
       LEFT JOIN page_contents pc ON pc.page_id = p.id
       LEFT JOIN users assignee ON assignee.id = p.assignee_id
       LEFT JOIN users creator ON creator.id = p.created_by
       WHERE p.team_id = ?1 AND p.is_deleted = 0 AND (
         p.title LIKE ?2 OR
         pc.content_json LIKE ?2 OR
         p.tags LIKE ?2 OR
         p.status LIKE ?2 OR
         assignee.name LIKE ?2 OR
         creator.name LIKE ?2
       )
       ORDER BY p.updated_at DESC
       LIMIT 50`,
    )
    .bind(teamId, like)
    .all<PageRow>();
  return results ?? [];
}

export async function searchAttachments(db: Env["DB"], teamId: string, q: string): Promise<AttachmentRow[]> {
  const like = `%${q}%`;
  const { results } = await db
    .prepare(
      `SELECT a.* FROM attachments a
       JOIN pages p ON p.id = a.page_id
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE p.team_id = ?1 AND a.is_deleted = 0 AND (
         a.file_name LIKE ?2 OR u.name LIKE ?2
       )
       ORDER BY a.created_at DESC
       LIMIT 50`,
    )
    .bind(teamId, like)
    .all<AttachmentRow>();
  return results ?? [];
}
