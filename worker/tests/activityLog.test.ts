import { expect, it } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { listActivityFeed, logActivity } from "../db/activityLog";
import { createPage, softDeletePage } from "../db/pages";

it("excludes deleted pages before applying the recent activity limit", async () => {
  const db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES ('team', 'Team')").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES ('author', 'author@test.local', 'Author', 'editor')").run();
  const viewer = { userId: "viewer", guestName: "Viewer" };
  const { page: active } = await createPage(db, { teamId: "team", parentId: null, title: "Active", createdBy: "author" });
  const { page: deleted } = await createPage(db, { teamId: "team", parentId: null, title: "Deleted", createdBy: "author" });
  for (const page of [active, deleted]) {
    await logActivity(db, { teamId: "team", pageId: page.id, actorId: "author", actorName: "Author", action: "page.updated" });
  }
  expect(await listActivityFeed(db, "team", viewer)).toHaveLength(2);
  await db.prepare("UPDATE activity_logs SET created_at = '2099-01-01' WHERE page_id = ?1").bind(deleted.id).run();
  await softDeletePage(db, "team", deleted.id);
  const feed = await listActivityFeed(db, "team", viewer, 1);
  expect(feed.map((item) => item.page_id)).toEqual([active.id]);
  await softDeletePage(db, "team", active.id);
  expect(await listActivityFeed(db, "team", viewer)).toEqual([]);
});
