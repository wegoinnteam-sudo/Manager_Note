import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { createHandoverNotice, listHandoverNotices, setHandoverNoticeDone } from "../db/handoverNotices";

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

const sampleInput = {
  noticeDate: "2026-09-19",
  noticeTime: "08:45",
  fromName: "Jane",
  reference: "Kim · 812호",
  category: "reception" as const,
  body: "PMS 객실 연결 확인 부탁드립니다.",
};

describe("handoverNotices", () => {
  it("creates and lists a notice, newest first", async () => {
    const first = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const second = await createHandoverNotice(
      db,
      TEAM,
      { ...sampleInput, noticeTime: "09:18", category: "hostel", body: "복도 소음 문의" },
      USER,
    );

    const notices = await listHandoverNotices(db, TEAM);
    expect(notices).toHaveLength(2);
    expect(notices[0].id).toBe(second.id);
    expect(notices[1].id).toBe(first.id);
    expect(notices[1].isDone).toBe(false);
    expect(notices[1].completedBy).toBeNull();
  });

  it("marks a notice done with a completer, then can undo it", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);

    const done = await setHandoverNoticeDone(db, TEAM, created.id, { isDone: true, completedBy: "가원" });
    expect(done?.isDone).toBe(true);
    expect(done?.completedBy).toBe("가원");
    expect(done?.completedAt).not.toBeNull();

    const undone = await setHandoverNoticeDone(db, TEAM, created.id, { isDone: false, completedBy: null });
    expect(undone?.isDone).toBe(false);
    expect(undone?.completedBy).toBeNull();
    expect(undone?.completedAt).toBeNull();
  });

  it("returns null when completing a notice from another team", async () => {
    const created = await createHandoverNotice(db, TEAM, sampleInput, USER);
    const result = await setHandoverNoticeDone(db, "team_other", created.id, { isDone: true, completedBy: "하나" });
    expect(result).toBeNull();
  });
});
