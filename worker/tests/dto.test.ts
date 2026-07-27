import { describe, it, expect } from "vitest";
import { toPageDetailDTO } from "../lib/dto";
import type { PageRow, PageContentRow } from "../db/pages";

function basePage(overrides: Partial<PageRow> = {}): PageRow {
  return {
    id: "page_1",
    team_id: "team_1",
    parent_id: null,
    title: "제목",
    status: "in_progress",
    assignee_id: null,
    due_date: null,
    tags: "[]",
    order_key: 1,
    version: 1,
    is_system: 0,
    is_deleted: 0,
    deleted_at: null,
    created_by: "user_1",
    updated_by: "user_1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseContent(overrides: Partial<PageContentRow> = {}): PageContentRow {
  return {
    page_id: "page_1",
    content_json: JSON.stringify({ blocks: [] }),
    version: 1,
    updated_by: "user_1",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("toPageDetailDTO", () => {
  it("parses well-formed tags and content", () => {
    const dto = toPageDetailDTO(basePage({ tags: JSON.stringify(["a", "b"]) }), baseContent());
    expect(dto.tags).toEqual(["a", "b"]);
    expect(dto.contentJson).toEqual({ blocks: [] });
    expect(dto.contentVersion).toBe(1);
  });

  it("falls back to an empty array/blocks instead of throwing on malformed JSON", () => {
    const dto = toPageDetailDTO(basePage({ tags: "not json" }), baseContent({ content_json: "{broken" }));
    expect(dto.tags).toEqual([]);
    expect(dto.contentJson).toEqual({ blocks: [] });
  });
});
