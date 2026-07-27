import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { recordStatusChange, listStatusHistory } from "../db/statusHistory";

let db: any;
const TEAM = "team_test";
const USER = "user_test";
const PAGE = "page_test";

beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, 'editor')").bind(USER, "u@test.local", "Tester").run();
  await db.prepare("INSERT INTO pages (id, team_id, title, created_by, updated_by) VALUES (?1, ?2, ?3, ?4, ?4)").bind(PAGE, TEAM, "t", USER).run();
});

describe("status history", () => {
  it("records who changed what and when", async () => {
    await recordStatusChange(db, { pageId: PAGE, fromStatus: "in_progress", toStatus: "handoff_pending", changedBy: USER });
    await recordStatusChange(db, { pageId: PAGE, fromStatus: "handoff_pending", toStatus: "done", changedBy: USER });

    const history = await listStatusHistory(db, PAGE);
    expect(history).toHaveLength(2);
    // Most recent first.
    expect(history[0].to_status).toBe("done");
    expect(history[0].from_status).toBe("handoff_pending");
    expect(history[1].to_status).toBe("handoff_pending");
    expect(history.every((h) => h.changed_by === USER)).toBe(true);
  });
});
