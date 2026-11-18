export interface SelectionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TableCellRange {
  rowIds: number[];
  columnIds: number[];
}

export function selectionRect(startX: number, startY: number, x: number, y: number): SelectionRect {
  return {
    left: Math.min(startX, x),
    right: Math.max(startX, x) + 1,
    top: Math.min(startY, y),
    bottom: Math.max(startY, y) + 1,
  };
}

export function overlaps(a: SelectionRect, b: SelectionRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function tableCellRange(table: HTMLElement, rect: SelectionRect): TableCellRange | null {
  // Clip the marquee to the table's scroll viewport, so off-screen cells
  // do not get selected simply because their DOM boxes extend past it.
  const viewport = table.getBoundingClientRect();
  const visibleRect = {
    left: Math.max(rect.left, viewport.left),
    right: Math.min(rect.right, viewport.right),
    top: Math.max(rect.top, viewport.top),
    bottom: Math.min(rect.bottom, viewport.bottom),
  };
  if (visibleRect.left >= visibleRect.right || visibleRect.top >= visibleRect.bottom) return null;

  const rowIds = new Set<number>();
  const columnIds = new Set<number>();
  const stickyRight = table.classList.contains("table-block--sticky-col")
    ? table.querySelector<HTMLElement>("[data-table-cell='0-0']")?.getBoundingClientRect().right
    : undefined;
  const stickyBottom = table.querySelector<HTMLElement>("[data-table-cell='0-0']")?.getBoundingClientRect().bottom;
  for (const cell of table.querySelectorAll<HTMLElement>("[data-table-cell]")) {
    const [row, col] = cell.dataset.tableCell!.split("-").map(Number);
    const bounds = cell.getBoundingClientRect();
    const left = col > 0 && stickyRight !== undefined ? Math.max(bounds.left, stickyRight) : bounds.left;
    const top = row > 0 && stickyBottom !== undefined ? Math.max(bounds.top, stickyBottom) : bounds.top;
    if (left >= bounds.right || top >= bounds.bottom) continue;
    if (!overlaps(visibleRect, { left, right: bounds.right, top, bottom: bounds.bottom })) continue;
    rowIds.add(row);
    columnIds.add(col);
  }
  return rowIds.size ? { rowIds: [...rowIds], columnIds: [...columnIds] } : null;
}

export function coversTable(rows: string[][], range: TableCellRange): boolean {
  return range.rowIds.length === rows.length && rows.every(
    (row, index) => range.rowIds.includes(index) &&
      row.every((_, column) => range.columnIds.includes(column)),
  );
}

export function clearTableCells(rows: string[][], range: TableCellRange): string[][] {
  return rows.map((row, r) => range.rowIds.includes(r)
    ? row.map((value, c) => range.columnIds.includes(c) ? "" : value)
    : row);
}
