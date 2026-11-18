import type { PageBlock } from "@shared/types";

type TableBlock = Extract<PageBlock, { type: "table" }>;

/** Column width used when a table has no saved colWidths. */
export const DEFAULT_COL_WIDTH = 160;

/** Readable content width of a document page (.page-view 778px − 2×64px padding). */
const DOC_CONTENT_WIDTH = 650;

/** Width the table takes at its own column widths (no stretching). */
export function tableNaturalWidth(block: Pick<TableBlock, "rows" | "colWidths">): number {
  const cols = block.rows[0]?.length ?? 0;
  let total = 0;
  for (let c = 0; c < cols; c++) total += block.colWidths?.[c] ?? DEFAULT_COL_WIDTH;
  return total;
}

/**
 * Whether a table needs the page to switch to its full-width layout. Small
 * tables stay inside the normal document column so adding one doesn't make
 * every paragraph on the page stretch edge to edge.
 */
export function tableNeedsWidePage(block: TableBlock): boolean {
  return block.width !== undefined || tableNaturalWidth(block) > DOC_CONTENT_WIDTH;
}

export type TablePresetKey = "blank" | "rooms" | "contacts" | "schedule";

type TablePreset = Pick<TableBlock, "rows" | "colWidths">;

function emptyRows(header: string[], count: number): string[][] {
  return [header, ...Array.from({ length: count }, () => header.map(() => ""))];
}

/** Starting content for each “/표” variant. Plain table data — same shape as any table. */
export const TABLE_PRESETS: Record<TablePresetKey, () => TablePreset> = {
  blank: () => ({ rows: emptyRows(["", "", ""], 2) }),
  rooms: () => ({
    rows: emptyRows(["객실 번호", "문제 유형", "처리 상태", "담당자", "메모"], 3),
    colWidths: [100, 120, 110, 100, 240],
  }),
  contacts: () => ({
    rows: emptyRows(["구분", "이름", "연락처", "메모"], 3),
    colWidths: [110, 120, 150, 220],
  }),
  schedule: () => ({
    rows: emptyRows(["날짜", "내용", "담당자", "상태"], 3),
    colWidths: [120, 260, 110, 110],
  }),
};
