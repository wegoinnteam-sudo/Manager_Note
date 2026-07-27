import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/fakeD1";
import { createPage, getPageById, getPageContent, updatePageContent, updatePageMeta, softDeletePage, restorePage, listPages } from "../db/pages";
import { AppError } from "../lib/errors";

let db: any;
const TEAM = "team_test";
const USER = "user_test";

beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO teams (id, name) VALUES (?1, ?2)").bind(TEAM, "Test Team").run();
  await db.prepare("INSERT INTO users (id, email, name, role) VALUES (?1, ?2, ?3, 'editor')").bind(USER, "u@test.local", "Tester").run();
});

describe("pages", () => {
  it("creates a page with the default untitled title and persists it", async () => {
    const { page, content } = await createPage(db, { teamId: TEAM, parentId: null, title: null, createdBy: USER });
    expect(page.title).toBe("제목 없음");
    expect(content.content_json).toBe(JSON.stringify({ blocks: [] }));

    const reloaded = await getPageById(db, TEAM, page.id);
    expect(reloaded?.id).toBe(page.id);
    expect(reloaded?.version).toBe(1);
  });

  it("lists only non-deleted pages by default", async () => {
    const { page: p1 } = await createPage(db, { teamId: TEAM, parentId: null, title: "A", createdBy: USER });
    await createPage(db, { teamId: TEAM, parentId: null, title: "B", createdBy: USER });
    await softDeletePage(db, TEAM, p1.id);

    const active = await listPages(db, TEAM);
    expect(active.map((p) => p.title)).toEqual(["B"]);

    const all = await listPages(db, TEAM, { includeDeleted: true });
    expect(all).toHaveLength(2);
  });

  it("updates metadata and bumps the version", async () => {
    const { page } = await createPage(db, { teamId: TEAM, parentId: null, title: "원본", createdBy: USER });
    const updated = await updatePageMeta(db, {
      teamId: TEAM,
      id: page.id,
      expectedVersion: page.version,
      updatedBy: USER,
      patch: { title: "수정됨", status: "done" },
    });
    expect(updated.title).toBe("수정됨");
    expect(updated.status).toBe("done");
    expect(updated.version).toBe(page.version + 1);
  });

  it("rejects a metadata update against a stale version (conflict detection)", async () => {
    const { page } = await createPage(db, { teamId: TEAM, parentId: null, title: "원본", createdBy: USER });
    await updatePageMeta(db, { teamId: TEAM, id: page.id, expectedVersion: page.version, updatedBy: USER, patch: { title: "첫 수정" } });

    // Someone else's stale client tries to save with the old version.
    await expect(
      updatePageMeta(db, { teamId: TEAM, id: page.id, expectedVersion: page.version, updatedBy: USER, patch: { title: "충돌 수정" } }),
    ).rejects.toThrow(AppError);
  });

  it("rejects a content update against a stale version, independent of the meta version", async () => {
    const { page, content } = await createPage(db, { teamId: TEAM, parentId: null, title: "원본", createdBy: USER });

    const first = await updatePageContent(db, {
      pageId: page.id,
      expectedVersion: content.version,
      content: { blocks: [{ id: "b1", type: "paragraph", text: "hello" }] },
      updatedBy: USER,
    });
    expect(first.version).toBe(content.version + 1);

    await expect(
      updatePageContent(db, {
        pageId: page.id,
        expectedVersion: content.version, // stale on purpose
        content: { blocks: [{ id: "b2", type: "paragraph", text: "conflict" }] },
        updatedBy: USER,
      }),
    ).rejects.toThrow(AppError);

    // Meta version should be untouched by a content-only save.
    const reloadedPage = await getPageById(db, TEAM, page.id);
    expect(reloadedPage?.version).toBe(page.version);
  });

  it("restores a soft-deleted page", async () => {
    const { page } = await createPage(db, { teamId: TEAM, parentId: null, title: "삭제 테스트", createdBy: USER });
    await softDeletePage(db, TEAM, page.id);
    let reloaded = await getPageById(db, TEAM, page.id);
    expect(reloaded?.is_deleted).toBe(1);

    await restorePage(db, TEAM, page.id);
    reloaded = await getPageById(db, TEAM, page.id);
    expect(reloaded?.is_deleted).toBe(0);
  });

  it("keeps page content and metadata in separate rows", async () => {
    const { page } = await createPage(db, { teamId: TEAM, parentId: null, title: "분리 확인", createdBy: USER });
    const content = await getPageContent(db, page.id);
    expect(content?.page_id).toBe(page.id);
  });
});
