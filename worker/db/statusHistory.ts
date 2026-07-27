import type { Env } from "../types";
import type { HandoffStatus } from "../../shared/types";
import { newId, nowIso } from "../lib/ids";

export interface StatusHistoryRow {
  id: string;
  page_id: string;
  from_status: HandoffStatus | null;
  to_status: HandoffStatus;
  changed_by: string;
  changed_at: string;
}

export async function recordStatusChange(
  db: Env["DB"],
  params: { pageId: string; fromStatus: HandoffStatus | null; toStatus: HandoffStatus; changedBy: string },
): Promise<StatusHistoryRow> {
  const id = newId("sh");
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO handoff_status_history (id, page_id, from_status, to_status, changed_by, changed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(id, params.pageId, params.fromStatus, params.toStatus, params.changedBy, now)
    .run();
  return { id, page_id: params.pageId, from_status: params.fromStatus, to_status: params.toStatus, changed_by: params.changedBy, changed_at: now };
}

export async function listStatusHistory(db: Env["DB"], pageId: string): Promise<StatusHistoryRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM handoff_status_history WHERE page_id = ?1 ORDER BY changed_at DESC")
    .bind(pageId)
    .all<StatusHistoryRow>();
  return results ?? [];
}
