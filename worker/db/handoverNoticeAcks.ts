import type { Env } from "../types";

// "All" category notices need every one of a fixed set of people to
// individually confirm they've seen it — a row's existence means that
// person acked; there's no "unacked" row to update.
export async function listAcksByTeam(db: Env["DB"], teamId: string): Promise<Map<string, string[]>> {
  const byNotice = new Map<string, string[]>();
  const { results } = await db
    .prepare(`SELECT notice_id, name FROM handover_notice_acks WHERE notice_id IN (SELECT id FROM handover_notices WHERE team_id = ?1 AND is_deleted = 0)`)
    .bind(teamId)
    .all<{ notice_id: string; name: string }>();

  for (const row of results ?? []) {
    const list = byNotice.get(row.notice_id) ?? [];
    list.push(row.name);
    byNotice.set(row.notice_id, list);
  }
  return byNotice;
}

export async function listAcksForNotice(db: Env["DB"], noticeId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM handover_notice_acks WHERE notice_id = ?1")
    .bind(noticeId)
    .all<{ name: string }>();
  return (results ?? []).map((row) => row.name);
}

export async function setAck(db: Env["DB"], noticeId: string, name: string, acked: boolean): Promise<void> {
  if (acked) {
    await db
      .prepare("INSERT INTO handover_notice_acks (notice_id, name) VALUES (?1, ?2) ON CONFLICT (notice_id, name) DO NOTHING")
      .bind(noticeId, name)
      .run();
  } else {
    await db.prepare("DELETE FROM handover_notice_acks WHERE notice_id = ?1 AND name = ?2").bind(noticeId, name).run();
  }
}
