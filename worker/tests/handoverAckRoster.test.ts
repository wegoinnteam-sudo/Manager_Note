import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { getHandoverAckRoster, setHandoverAckRoster } from "../db/handoverAckRoster";
import { createHandoverNotice, listHandoverNotices, setHandoverNoticeAck } from "../db/handoverNotices";

let db: any;
const TEAM = "team_test";
const USER = "user_test";

beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
  await db
    .prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, ?4)")
    .bind(USER, "user@example.com", "Daniel", "editor")
    .run();
});

describe("handoverAckRoster", () => {
  it("seeds the default names on first read", async () => {
    expect(await getHandoverAckRoster(db, TEAM)).toEqual(["Justin", "Jane", "Been", "Daniel"]);
    // Reading again doesn't re-insert or reorder anything.
    expect(await getHandoverAckRoster(db, TEAM)).toEqual(["Justin", "Jane", "Been", "Daniel"]);
  });

  it("renames a slot and carries existing acks under the old name over to the new one", async () => {
    const notice = await createHandoverNotice(
      db,
      TEAM,
      {
        noticeDate: "2026-09-19",
        noticeTime: "08:45",
        // Not on the roster, so the writer isn't auto-checked and this test
        // only sees the acks it sets itself.
        fromName: "손님",
        reference: "Kim · 812호",
        category: "everyone",
        body: "전체 공지 확인 요망.",
      },
      USER,
    );
    await setHandoverNoticeAck(db, TEAM, notice.id, "Justin", true);

    const renamed = await setHandoverAckRoster(db, TEAM, ["James", "Jane", "Been", "Daniel"]);
    expect(renamed).toEqual(["James", "Jane", "Been", "Daniel"]);
    expect(await getHandoverAckRoster(db, TEAM)).toEqual(["James", "Jane", "Been", "Daniel"]);

    const notices = await listHandoverNotices(db, TEAM);
    expect(notices.find((n) => n.id === notice.id)!.acks).toEqual(["James"]);
  });

  it("keeps rosters separate per team", async () => {
    await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind("team_other", "Other Team").run();
    await setHandoverAckRoster(db, TEAM, ["A", "B", "C", "D"]);
    expect(await getHandoverAckRoster(db, "team_other")).toEqual(["Justin", "Jane", "Been", "Daniel"]);
  });
});
