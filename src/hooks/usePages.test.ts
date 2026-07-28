import { describe, it, expect } from "vitest";
import { buildPageTree } from "./usePages";
import type { PageSummaryDTO } from "@shared/types";

function page(overrides: Partial<PageSummaryDTO>): PageSummaryDTO {
  return {
    id: "p1",
    teamId: "team_1",
    parentId: null,
    title: "제목",
    status: "in_progress",
    assigneeId: null,
    dueDate: null,
    orderKey: 0,
    version: 1,
    openQuestionCount: 0,
    isDeleted: false,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildPageTree", () => {
  it("nests children under their parent and sorts by orderKey", () => {
    const pages = [
      page({ id: "root", parentId: null, orderKey: 1, title: "Root" }),
      page({ id: "child2", parentId: "root", orderKey: 2, title: "Child 2" }),
      page({ id: "child1", parentId: "root", orderKey: 1, title: "Child 1" }),
    ];

    const tree = buildPageTree(pages);
    expect(tree).toHaveLength(1);
    expect(tree[0].page.id).toBe("root");
    expect(tree[0].children.map((c) => c.page.id)).toEqual(["child1", "child2"]);
  });

  it("treats a page whose parent no longer exists as a root (e.g. parent moved to trash)", () => {
    const pages = [page({ id: "orphan", parentId: "missing-parent" })];
    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.page.id)).toEqual(["orphan"]);
  });
});
