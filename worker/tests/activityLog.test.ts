import { expect, it } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { ackAllActivity, listActivityFeed, logActivity } from "../db/activityLog";
import { createPage, softDeletePage, updatePageContent } from "../db/pages";
import { toActivityFeedItemDTO } from "../lib/dto";

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

it("limits acknowledged history after selecting the newest edit per page and author", async () => {
  const db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES ('team', 'Team')").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES ('author', 'author@test.local', 'Author', 'editor')").run();
  const viewer = { userId: "viewer", guestName: "Viewer" };
  const { page } = await createPage(db, { teamId: "team", parentId: null, title: "Edited page", createdBy: "author" });
  for (let edit = 0; edit < 32; edit++) {
    await logActivity(db, {
      teamId: "team", pageId: page.id, actorId: "author", actorName: "Author",
      action: "page.updated", metadata: { edit },
    });
  }

  for (let editor = 0; editor < 30; editor++) {
    await logActivity(db, {
      teamId: "team", pageId: page.id, actorId: "author", actorName: `Editor ${editor}`,
      action: "page.updated",
    });
  }
  await logActivity(db, {
    teamId: "team", pageId: page.id, actorId: "author", actorName: "Author",
    action: "page.updated", metadata: { edit: 32 },
  });

  await ackAllActivity(db, "team", viewer);

  expect(await listActivityFeed(db, "team", viewer)).toEqual([]);
  const history = await listActivityFeed(db, "team", viewer, 30, true);
  expect(history).toHaveLength(30);
  expect(history.every((item) => item.acked === 1)).toBe(true);
  expect(history.map((item) => item.actor_name)).toEqual([
    "Author", ...Array.from({ length: 29 }, (_, index) => `Editor ${29 - index}`),
  ]);
  expect(JSON.parse(history[0].metadata_json).edit).toBe(32);
});

it("labels empty and removed content and keeps deleted pages in history", async () => {
  const db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES ('team', 'Team')").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES ('author', 'author@test.local', 'Author', 'editor')").run();
  const viewer = { userId: "author", guestName: "Writer" };
  const { page, content } = await createPage(db, { teamId: "team", parentId: null, title: "Edited page", createdBy: "author" });
  const base = { teamId: "team", pageId: page.id, actorId: "author" };
  const history = async () => (await listActivityFeed(db, "team", viewer, 30, true)).map(toActivityFeedItemDTO);
  await logActivity(db, { ...base, actorName: "Writer", action: "page.updated" });
  expect((await history())[0].historyPage).toEqual({ title: "Edited page", deleted: false, contentUnavailable: true });

  const kept = { id: "kept", type: "paragraph", text: "Keep this" } as const;
  const filled = await updatePageContent(db, {
    pageId: page.id, expectedVersion: content.version, updatedBy: "author",
    content: { blocks: [kept, { id: "removed", type: "paragraph", text: "Remove this" }] },
  });
  expect(filled.contentRemoved).toBe(false);
  await logActivity(db, { ...base, actorName: "Writer", action: "content.updated" });
  const updated = await updatePageContent(db, {
    pageId: page.id, expectedVersion: filled.version, updatedBy: "author", content: { blocks: [kept] },
  });
  await logActivity(db, {
    ...base, actorName: "Reviewer", action: "content.updated", metadata: { contentRemoved: updated.contentRemoved },
  });
  expect((await history()).map((item) => [item.actorName, item.historyPage?.contentUnavailable])).toEqual([
    ["Reviewer", true], ["Writer", false],
  ]);

  await softDeletePage(db, "team", page.id);
  await logActivity(db, { ...base, actorName: "Writer", action: "page.deleted" });
  const deletedHistory = await history();
  expect(deletedHistory).toHaveLength(2);
  expect(deletedHistory[0].action).toBe("page.deleted");
  expect(deletedHistory.every((item) => item.historyPage?.deleted && item.historyPage.contentUnavailable)).toBe(true);
  expect(await listActivityFeed(db, "team", viewer)).toEqual([]);
});
