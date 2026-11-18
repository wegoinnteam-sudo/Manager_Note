import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PageBlock } from "@shared/types";
import { clearTableCells, coversTable, selectionRect, tableCellRange, type TableCellRange } from "./marqueeSelection";
import { DEFAULT_COL_WIDTH, tableNaturalWidth } from "./tableDefaults";

type TableBlock = Extract<PageBlock, { type: "table" }>;
type CellPos = { r: number; c: number };
type Selection = TableCellRange;
type FontSize = "sm" | "md" | "lg";
type SortState = { col: number; dir: "asc" | "desc" } | null;
type CaretMode = "end" | "all";
type StatusTone = "done" | "progress" | "pending" | "problem";

const FONT_SIZE_PX: Record<FontSize, number> = { sm: 12, md: 13, lg: 16 };
const TEXT_SWATCHES = ["#111827", "#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed"];
const BG_SWATCHES = [null, "#fef3c7", "#dcfce7", "#dbeafe", "#fee2e2", "#ede9fe"];
// Below this many rows there is nothing worth searching, so the search bar
// (and, for read-only viewers, the sort/filter buttons) stays out of the way.
const TOOLBAR_MIN_ROWS = 7;

type CellStyles = NonNullable<TableBlock["cellStyles"]>;

/** Re-key per-cell styles after rows/columns move. `map` returns the new position, or null to drop it. */
function remapStyles(styles: TableBlock["cellStyles"], map: (r: number, c: number) => CellPos | null): TableBlock["cellStyles"] {
  if (!styles) return styles;
  const next: CellStyles = {};
  for (const [key, value] of Object.entries(styles)) {
    const [r, c] = key.split("-").map(Number);
    const to = map(r, c);
    if (to) next[cellKey(to.r, to.c)] = value;
  }
  return next;
}

// Cell values that read as a status get a colored pill. Matching is on the
// whole (trimmed) cell value only, so free text is never decorated.
const STATUS_WORDS: Record<StatusTone, string[]> = {
  done: ["완료", "처리 완료", "수리 완료", "해결", "정상", "사용 가능", "확인 완료", "done"],
  progress: ["진행 중", "진행중", "수리 중", "수리중", "확인 중", "확인중", "처리 중", "처리중", "청소 중", "청소중"],
  pending: ["접수", "대기", "예정", "수리 예정", "보류", "미정", "확인 필요"],
  problem: ["고장", "긴급", "불가", "사용 불가", "미처리", "지연", "취소"],
};
const STATUS_TONE = new Map<string, StatusTone>(
  (Object.entries(STATUS_WORDS) as [StatusTone, string[]][]).flatMap(([tone, words]) => words.map((w) => [w.toLowerCase(), tone] as const)),
);
const DATE_RE = /^\d{4}[-./]\s?\d{1,2}[-./]\s?\d{1,2}\.?(\s*\(.\))?$/;
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function singleCell(r: number, c: number): Selection {
  return { rowIds: [r], columnIds: [c] };
}

function inSelection(sel: Selection | null, r: number, c: number): boolean {
  return !!sel && sel.rowIds.includes(r) && sel.columnIds.includes(c);
}

function cellKey(r: number, c: number): string {
  return `${r}-${c}`;
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function CellContent({ value, header, plain, placeholder }: { value: string; header: boolean; plain: boolean; placeholder?: string }) {
  if (header && placeholder && !value.trim()) return <span className="table-block__placeholder">{placeholder}</span>;
  if (!header && !plain) {
    const text = value.trim();
    const tone = STATUS_TONE.get(text.toLowerCase());
    if (tone) return <span className={`table-block__status table-block__status--${tone}`}>{text}</span>;
    if (DATE_RE.test(text)) return <span className="table-block__date">{value}</span>;
  }
  return <>{value}</>;
}

export function TableBlockView({
  block,
  editable,
  onPatch,
  onRemoveBlock,
  onInsertParagraphAfter,
  marqueeRange,
  focusMarqueeRange,
  autoFocus = false,
}: {
  block: TableBlock;
  editable: boolean;
  onPatch: (patch: Partial<PageBlock>) => void;
  onRemoveBlock: () => void;
  onInsertParagraphAfter: () => void;
  marqueeRange?: TableCellRange;
  focusMarqueeRange?: boolean;
  /** Open a cell for typing right after the table is inserted. */
  autoFocus?: boolean;
}) {
  const rows = block.rows;
  const colCount = rows[0]?.length ?? 0;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<CellPos | null>(null);
  const [fontSizeInput, setFontSizeInput] = useState("10");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colMenu, setColMenu] = useState<{ c: number; x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<number, string>>({});

  const dragRef = useRef<{ anchor: CellPos; x: number; y: number; fromEditor: boolean; moved: boolean } | null>(null);
  const resizeRef = useRef<{ c: number; startX: number; startWidth: number; pointerId: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const caretModeRef = useRef<CaretMode | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const isRange = !!selection && (selection.rowIds.length > 1 || selection.columnIds.length > 1);

  // ---- View (search / filter / sort): display order only, never saved ----
  const activeFilters = Object.entries(filters).filter(([c, v]) => v.trim() && Number(c) < colCount);
  const viewActive = !!query.trim() || !!sort || activeFilters.length > 0;

  // While a cell is being edited, keep the on-screen order frozen so the row
  // doesn't jump (sort) or vanish (filter) under the caret as you type.
  const frozenOrderRef = useRef<{ len: number; order: number[] } | null>(null);
  const displayRows = useMemo(() => {
    if (rows.length === 0) return [];
    const frozen = frozenOrderRef.current;
    if (editing && viewActive && frozen && frozen.len === rows.length) return frozen.order;
    const q = query.trim().toLowerCase();
    let body = rows.map((_, i) => i).slice(1);
    if (q) body = body.filter((r) => rows[r].some((cell) => cell.toLowerCase().includes(q)));
    for (const [c, v] of Object.entries(filters)) {
      const needle = v.trim().toLowerCase();
      if (!needle) continue;
      body = body.filter((r) => (rows[r][Number(c)] ?? "").toLowerCase().includes(needle));
    }
    if (sort && sort.col < colCount) {
      const dir = sort.dir === "asc" ? 1 : -1;
      body = [...body].sort((a, b) => {
        const va = rows[a][sort.col] ?? "";
        const vb = rows[b][sort.col] ?? "";
        if (!va.trim() !== !vb.trim()) return va.trim() ? -1 : 1; // blanks always last
        return collator.compare(va, vb) * dir || a - b;
      });
    }
    const order = [0, ...body];
    frozenOrderRef.current = { len: rows.length, order };
    return order;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, filters, sort, colCount, editing]);

  useEffect(() => {
    setSelection(null);
  }, [query, sort, filters]);

  const displayIndex = useMemo(() => new Map(displayRows.map((r, i) => [r, i])), [displayRows]);
  const nextRow = (r: number) => displayRows[(displayIndex.get(r) ?? -2) + 1];
  const prevRow = (r: number) => {
    const i = displayIndex.get(r);
    return i === undefined || i === 0 ? undefined : displayRows[i - 1];
  };

  // ---- Closing popovers on outside click ----
  useEffect(() => {
    if (!menu && !colMenu && !settingsOpen) return;
    const close = () => {
      setMenu(null);
      setColMenu(null);
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, colMenu, settingsOpen]);

  // ---- Editing: focus + auto-height for the single live textarea ----
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    const mode = caretModeRef.current;
    if (mode && editing) {
      caretModeRef.current = null;
      el.focus({ preventScroll: false });
      if (mode === "all") el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing, rows]);

  const startEdit = (r: number, c: number, caret: CaretMode) => {
    if (!editable) return;
    caretModeRef.current = caret;
    setSelection(singleCell(r, c));
    setEditing({ r, c });
  };
  const startEditRef = useRef(startEdit);
  startEditRef.current = startEdit;

  // A freshly inserted table opens its first empty header cell (blank table)
  // or its first body cell (preset with column names) so typing can start.
  useEffect(() => {
    if (!autoFocus || !editable || rows.length === 0) return;
    const headerBlank = rows[0].every((cell) => !cell.trim());
    if (headerBlank || rows.length === 1) startEditRef.current(0, 0, "end");
    else startEditRef.current(1, 0, "end");
    // Mount only: later re-activations of the block must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusCellBox = useCallback((r: number, c: number) => {
    requestAnimationFrame(() => {
      tableRef.current?.querySelector<HTMLElement>(`[data-cell="${cellKey(r, c)}"]`)?.focus({ preventScroll: false });
    });
  }, []);

  useEffect(() => {
    if (marqueeRange) {
      setEditing(null);
      if (focusMarqueeRange) focusCellBox(marqueeRange.rowIds[0], marqueeRange.columnIds[0]);
    }
    setSelection(marqueeRange ?? null);
  }, [marqueeRange, focusMarqueeRange, focusCellBox]);

  const stopEdit = (keepFocus: boolean) => {
    const cur = editing;
    setEditing(null);
    if (keepFocus && cur) focusCellBox(cur.r, cur.c);
  };

  // A plain click (mousedown + mouseup on the same cell, no drag) opens the
  // cell for editing; a drag leaves a range selected for delete/merge/style.
  useEffect(() => {
    const updateRange = (event: MouseEvent) => {
      const drag = dragRef.current;
      const table = tableRef.current;
      if (!drag || !table) return;
      const distance = Math.max(Math.abs(event.clientX - drag.x), Math.abs(event.clientY - drag.y));
      if (!drag.moved && distance <= 4) return;
      const range = tableCellRange(table, selectionRect(drag.x, drag.y, event.clientX, event.clientY));
      if (drag.fromEditor && range?.rowIds.length === 1 && range.columnIds.length === 1 && !drag.moved) return;
      if (!drag.moved) {
        window.getSelection()?.removeAllRanges();
        table.focus({ preventScroll: true });
        setEditing(null);
      }
      drag.moved = true;
      setSelection(range);
    };
    const onUp = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      updateRange(event);
      dragRef.current = null;
      const { r, c } = drag.anchor;
      if (drag.moved) focusCellBox(r, c);
      else if (!drag.fromEditor) startEditRef.current(r, c, "end");
    };
    window.addEventListener("mousemove", updateRange);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", updateRange);
      window.removeEventListener("mouseup", onUp);
    };
  }, [focusCellBox]);

  // ---- Data edits (all go through onPatch; shape unchanged) ----
  const updateCell = (r: number, c: number, value: string) => {
    onPatch({ rows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)) });
  };

  const clearRange = (sel: Selection) => onPatch({ rows: clearTableCells(rows, sel) });

  const mergeRange = (sel: Selection) => {
    const firstRow = sel.rowIds[0];
    const parts: string[] = [];
    for (const r of sel.rowIds) {
      for (const c of sel.columnIds) {
        if (rows[r][c]) parts.push(rows[r][c]);
      }
    }
    const joined = parts.join(" ");
    onPatch({
      rows: rows.map((row, ri) =>
        sel.rowIds.includes(ri)
          ? row.map((cell, ci) => (sel.columnIds.includes(ci) ? (ri === firstRow && ci === sel.columnIds[0] ? joined : "") : cell))
          : row,
      ),
    });
    setSelection(singleCell(firstRow, sel.columnIds[0]));
    setMenu(null);
  };

  const closeMenus = () => {
    setMenu(null);
    setColMenu(null);
  };

  const addRow = () => {
    onPatch({ rows: [...rows, rows[0].map(() => "")] });
    if (!viewActive) startEdit(rows.length, 0, "end");
  };
  /** Insert an empty row right below stored row `r` (styles of later rows move down with them). */
  const insertRowBelow = (r: number) => {
    const at = r + 1;
    onPatch({
      rows: [...rows.slice(0, at), rows[0].map(() => ""), ...rows.slice(at)],
      cellStyles: remapStyles(block.cellStyles, (sr, sc) => ({ r: sr >= at ? sr + 1 : sr, c: sc })),
    });
    closeMenus();
    startEdit(at, 0, "end");
  };
  /** Insert an empty column at index `at`; widths, styles and view state follow. */
  const insertColumnAt = (at: number) => {
    onPatch({
      rows: rows.map((row) => [...row.slice(0, at), "", ...row.slice(at)]),
      colWidths: block.colWidths ? [...block.colWidths.slice(0, at), DEFAULT_COL_WIDTH, ...block.colWidths.slice(at)] : undefined,
      cellStyles: remapStyles(block.cellStyles, (sr, sc) => ({ r: sr, c: sc >= at ? sc + 1 : sc })),
    });
    setSort(null);
    setFilters({});
    closeMenus();
    startEdit(0, at, "end");
  };
  const addColumn = () => insertColumnAt(colCount);

  const removeRows = (sel: Selection) => {
    if (rows.length - sel.rowIds.length < 1) return;
    const removed = new Set(sel.rowIds);
    const shift = (r: number) => r - sel.rowIds.filter((x) => x < r).length;
    onPatch({
      rows: rows.filter((_, ri) => !removed.has(ri)),
      cellStyles: remapStyles(block.cellStyles, (sr, sc) => (removed.has(sr) ? null : { r: shift(sr), c: sc })),
    });
    setSelection(null);
    setEditing(null);
    closeMenus();
  };
  const removeColumns = (columnIds: number[]) => {
    if (rows[0].length - columnIds.length < 1) return;
    const removed = new Set(columnIds);
    const shift = (c: number) => c - columnIds.filter((x) => x < c).length;
    onPatch({
      rows: rows.map((row) => row.filter((_, ci) => !removed.has(ci))),
      colWidths: block.colWidths?.filter((_, ci) => !removed.has(ci)),
      cellStyles: remapStyles(block.cellStyles, (sr, sc) => (removed.has(sc) ? null : { r: sr, c: shift(sc) })),
    });
    setSort(null);
    setFilters({});
    setSelection(null);
    setEditing(null);
    closeMenus();
  };

  const applyStyle = (sel: Selection, patch: Partial<{ color: string; bg: string | undefined; fontSize: FontSize; fontSizePt: number | undefined }>) => {
    const next = { ...(block.cellStyles ?? {}) };
    for (const r of sel.rowIds) {
      for (const c of sel.columnIds) {
        const key = cellKey(r, c);
        next[key] = { ...next[key], ...patch };
      }
    }
    onPatch({ cellStyles: next });
  };

  const colWidth = (c: number) => block.colWidths?.[c] ?? DEFAULT_COL_WIDTH;
  const fontSizeValid = Number.isFinite(Number(fontSizeInput)) && Number(fontSizeInput) >= 1 && Number(fontSizeInput) <= 200;
  const applyFontSize = () => {
    if (!fontSizeValid) return;
    applyStyle(selection ?? { rowIds: rows.map((_, r) => r), columnIds: rows[0].map((_, c) => c) }, { fontSizePt: Number(fontSizeInput) });
  };

  // ---- Column resize (header handle) ----
  const startResize = (e: React.PointerEvent<HTMLSpanElement>, c: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const tableRow = e.currentTarget.closest("tr");
    const widths = rows[0].map((_, ci) => tableRow?.cells[ci]?.getBoundingClientRect().width ?? colWidth(ci));
    onPatch({ colWidths: widths });
    resizeRef.current = { c, startX: e.clientX, startWidth: widths[c], pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const stopResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (resizeRef.current?.pointerId !== e.pointerId) return;
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const doResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    const cur = resizeRef.current;
    if (!cur || cur.pointerId !== e.pointerId) return;
    if ((e.buttons & 1) === 0) {
      stopResize(e);
      return;
    }
    const delta = e.clientX - cur.startX;
    const widths = rows[0].map((_, ci) => block.colWidths?.[ci] ?? DEFAULT_COL_WIDTH);
    widths[cur.c] = Math.max(60, Math.round(cur.startWidth + delta));
    onPatch({ colWidths: widths });
  };

  // ---- Mouse ----
  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (!editable || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".table-block__col-resize, .table-block__col-btn")) return;
    const fromEditor = !!target.closest("textarea");
    dragRef.current = { anchor: { r, c }, x: e.clientX, y: e.clientY, fromEditor, moved: false };
    if (fromEditor) return; // Allow text selection while the pointer stays in this cell.
    e.preventDefault();
    setEditing(null);
    setSelection(singleCell(r, c));
  };
  const onCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
    if (!editable) return;
    e.preventDefault();
    if (!inSelection(selection, r, c)) setSelection(singleCell(r, c));
    setColMenu(null);
    setSettingsOpen(false);
    // Opened from the keyboard (Menu key / Shift+F10) there is no pointer position.
    if (e.clientX === 0 && e.clientY === 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({ x: rect.left + 8, y: rect.bottom });
    } else {
      setMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // ---- Keyboard while a cell is open for editing ----
  const moveEditTo = (target: CellPos | undefined, caret: CaretMode) => {
    if (target) startEdit(target.r, target.c, caret);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    e.stopPropagation(); // the table's own selection-mode handler must not see these
    if (e.nativeEvent.isComposing) return; // Korean IME: let the composition commit first

    const input = e.currentTarget;
    const value = input.value;
    const caretStart = input.selectionStart ?? 0;
    const caretEnd = input.selectionEnd ?? 0;

    if ((e.ctrlKey || e.metaKey) && e.key === ";") {
      e.preventDefault();
      const now = new Date();
      const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      const nextValue = value.slice(0, caretStart) + stamp + value.slice(caretEnd);
      const nextCaret = caretStart + stamp.length;
      updateCell(r, c, nextValue);
      requestAnimationFrame(() => input.setSelectionRange(nextCaret, nextCaret));
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      stopEdit(true);
      return;
    }

    if (e.key === "Backspace" && value === "" && rows.length > 1 && rows[r].every((cell) => cell === "")) {
      e.preventDefault();
      let target = prevRow(r) ?? nextRow(r) ?? 0;
      if (target > r) target -= 1; // indices after the removed row shift up
      onPatch({ rows: rows.filter((_, ri) => ri !== r) });
      startEdit(target, c, "end");
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const below = nextRow(r);
      if (below !== undefined) {
        startEdit(below, c, "all");
      } else if (!viewActive) {
        onPatch({ rows: [...rows, rows[0].map(() => "")] });
        startEdit(rows.length, c, "all");
      } else {
        stopEdit(true);
      }
      return;
    }

    if (e.key === "Tab") {
      let target: CellPos | undefined;
      if (e.shiftKey) {
        const up = prevRow(r);
        target = c > 0 ? { r, c: c - 1 } : up !== undefined ? { r: up, c: colCount - 1 } : undefined;
      } else {
        const down = nextRow(r);
        target = c < colCount - 1 ? { r, c: c + 1 } : down !== undefined ? { r: down, c: 0 } : undefined;
      }
      if (target) {
        e.preventDefault();
        moveEditTo(target, "all");
      } else {
        setEditing(null); // let Tab leave the table naturally
      }
      return;
    }

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const target = e.key === "ArrowDown" ? nextRow(r) : prevRow(r);
      if (target !== undefined) startEdit(target, c, "all");
      else if (e.key === "ArrowDown" && !viewActive) {
        setEditing(null);
        onInsertParagraphAfter();
      }
      return;
    }

    if (e.key === "ArrowRight" && caretStart === value.length && caretEnd === caretStart) {
      const down = nextRow(r);
      const target = c + 1 < colCount ? { r, c: c + 1 } : down !== undefined ? { r: down, c: 0 } : undefined;
      if (target) {
        e.preventDefault();
        startEdit(target.r, target.c, "end");
      }
    } else if (e.key === "ArrowLeft" && caretStart === 0 && caretEnd === 0) {
      const up = prevRow(r);
      const target = c > 0 ? { r, c: c - 1 } : up !== undefined ? { r: up, c: colCount - 1 } : undefined;
      if (target) {
        e.preventDefault();
        startEdit(target.r, target.c, "end");
      }
    }
  };

  // ---- Keyboard while cells are selected but not being edited ----
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editable || editing || !selection) return;
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && !target.closest("[data-cell]")) return;
    const { rowIds, columnIds } = selection;
    const c = columnIds[0];
    const r = rowIds[0];
    const moveSel = (nr: number | undefined, nc: number) => {
      if (nr === undefined || nc < 0 || nc >= colCount) return;
      e.preventDefault();
      setSelection(singleCell(nr, nc));
      focusCellBox(nr, nc);
    };
    switch (e.key) {
      case "ArrowDown":
        return moveSel(nextRow(rowIds[rowIds.length - 1]), c);
      case "ArrowUp":
        return moveSel(prevRow(r), c);
      case "ArrowRight":
        return moveSel(r, columnIds[columnIds.length - 1] + 1);
      case "ArrowLeft":
        return moveSel(r, c - 1);
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(r, c, "end");
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        if (e.repeat) return;
        const removeTable = coversTable(rows, selection);
        if (!window.confirm(removeTable ? "정말 이 표를 삭제할까요?" : "선택한 표 셀의 내용을 지울까요?")) return;
        if (removeTable) onRemoveBlock();
        else clearRange(selection);
        return;
      }
      case "Escape":
        e.preventDefault();
        setSelection(null);
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      default:
    }
  };

  // ---- Toolbar helpers ----
  const headerName = (c: number) => rows[0]?.[c]?.trim() || `열 ${c + 1}`;
  const openColMenu = (e: React.MouseEvent<HTMLButtonElement>, c: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu(null);
    setSettingsOpen(false);
    setColMenu((cur) => (cur?.c === c ? null : { c, x: Math.min(rect.left, window.innerWidth - 232), y: rect.bottom + 4 }));
  };
  const setFilter = (c: number, value: string) => setFilters((prev) => ({ ...prev, [c]: value }));
  const clearFilter = (c: number) =>
    setFilters((prev) => {
      const next = { ...prev };
      delete next[c];
      return next;
    });
  const clearView = () => {
    setQuery("");
    setSort(null);
    setFilters({});
  };

  const searchable = rows.length >= TOOLBAR_MIN_ROWS;
  const showTopBar = searchable || viewActive;
  // Sort/filter (and, when editable, insert/delete) live in the header menu.
  const columnTools = editable || searchable;
  // No explicit % width: the table sits at its own column widths instead of
  // stretching a two-column table across the whole page.
  const naturalWidth = block.width === undefined ? tableNaturalWidth(block) : undefined;
  const stickyCol = colCount > 1;
  const bodyCount = Math.max(0, rows.length - 1);

  const cellTextStyle = (r: number, c: number) => {
    const style = block.cellStyles?.[cellKey(r, c)];
    return {
      color: style?.color,
      fontSize: style?.fontSizePt !== undefined ? `${style.fontSizePt}pt` : FONT_SIZE_PX[style?.fontSize ?? "md"],
    };
  };

  return (
    <div className="block-row table-block-row">
      <div className="table-block-layout">
        {showTopBar && (
          <div className="table-block__toolbar" role="toolbar" aria-label="표 도구">
            <label className="table-block__search">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input type="search" aria-label="표에서 검색" placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>

            {sort && sort.col < colCount && (
              <button type="button" className="table-chip" onClick={() => setSort(null)} aria-label={`${headerName(sort.col)} 정렬 해제`}>
                {headerName(sort.col)} {sort.dir === "asc" ? "↑" : "↓"}
                <span aria-hidden="true">×</span>
              </button>
            )}
            {activeFilters.map(([c, v]) => (
              <button key={c} type="button" className="table-chip" onClick={() => clearFilter(Number(c))} aria-label={`${headerName(Number(c))} 필터 해제`}>
                {headerName(Number(c))}: {v}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            {viewActive && (
              <>
                <span className="table-block__count">
                  {bodyCount}행 중 {displayRows.length - 1}행
                </span>
                <button type="button" className="table-tool-btn table-tool-btn--quiet" onClick={clearView}>
                  모두 해제
                </button>
              </>
            )}

          </div>
        )}

        <div
          ref={tableRef}
          data-table-selection
          tabIndex={-1}
          className={`table-block${stickyCol ? " table-block--sticky-col" : ""}`}
          onKeyDown={handleTableKeyDown}
          style={{ width: `${block.width ?? 100}%`, marginLeft: block.align === "center" || block.align === "right" ? "auto" : 0, marginRight: block.align === "center" ? "auto" : 0 }}
        >
          <table
            style={{
              tableLayout: "fixed",
              width: naturalWidth,
              marginLeft: naturalWidth !== undefined && (block.align === "center" || block.align === "right") ? "auto" : undefined,
              marginRight: naturalWidth !== undefined && block.align === "center" ? "auto" : undefined,
              minWidth: block.width !== undefined && !block.colWidths ? rows[0].length * 60 : rows[0].reduce((width, _, c) => width + colWidth(c), 0),
            }}
          >
            <colgroup>
              {rows[0].map((_, c) => (
                <col key={c} style={{ width: block.width !== undefined && !block.colWidths ? undefined : colWidth(c) }} />
              ))}
            </colgroup>
            <tbody>
              {displayRows.map((r) => {
                const row = rows[r];
                const header = r === 0;
                return (
                  <tr key={r} className={header ? "table-block__head" : undefined}>
                    {row.map((cell, c) => {
                      const style = block.cellStyles?.[cellKey(r, c)];
                      const isEditing = !!editing && editing.r === r && editing.c === c;
                      const selected = inSelection(selection, r, c);
                      const sortDir = header && sort?.col === c ? sort.dir : null;
                      const filtered = header && !!filters[c]?.trim();
                      const classes = [
                        selected && (isRange || !isEditing) ? "table-block__cell--selected" : "",
                        isEditing ? "table-block__cell--editing" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <td
                          key={c}
                          className={classes || undefined}
                          style={style?.bg ? { background: style.bg } : undefined}
                          data-table-cell={cellKey(r, c)}
                          onMouseDown={(e) => onCellMouseDown(r, c, e)}
                          onContextMenu={(e) => onCellContextMenu(e, r, c)}
                        >
                          {isEditing ? (
                            <textarea
                              ref={editorRef}
                              className="table-block__editor"
                              rows={1}
                              value={cell}
                              aria-label={header ? `열 ${c + 1} 이름` : `${headerName(c)} 셀`}
                              placeholder={header ? `열 ${c + 1}` : undefined}
                              onChange={(e) => {
                                updateCell(r, c, e.target.value);
                                e.currentTarget.style.height = "auto";
                                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                              }}
                              onKeyDown={(e) => handleEditorKeyDown(e, r, c)}
                              onDragStart={(e) => e.preventDefault()}
                              onBlur={() => setEditing((cur) => (cur && cur.r === r && cur.c === c ? null : cur))}
                              style={cellTextStyle(r, c)}
                            />
                          ) : (
                            <div
                              className={`table-block__cell${header && columnTools ? " table-block__cell--with-btn" : ""}`}
                              data-cell={cellKey(r, c)}
                              tabIndex={editable ? -1 : undefined}
                              style={cellTextStyle(r, c)}
                            >
                              <CellContent value={cell} header={header} plain={!!style?.color} placeholder={editable ? `열 ${c + 1}` : undefined} />
                            </div>
                          )}
                          {header && columnTools && (
                            <button
                              type="button"
                              className={`table-block__col-btn${sortDir || filtered ? " table-block__col-btn--active" : ""}`}
                              aria-label={`${headerName(c)} 열 메뉴`}
                              aria-haspopup="dialog"
                              aria-expanded={colMenu?.c === c}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => openColMenu(e, c)}
                            >
                              {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : filtered ? "≡" : "⌄"}
                            </button>
                          )}
                          {editable && header && (
                            <span
                              className="table-block__col-resize"
                              aria-hidden="true"
                              onPointerDown={(e) => startResize(e, c)}
                              onPointerMove={doResize}
                              onPointerUp={stopResize}
                              onPointerCancel={stopResize}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {viewActive && displayRows.length === 1 && (
            <div className="table-block__empty">
              조건에 맞는 행이 없습니다.
              <button type="button" className="table-settings__link" onClick={clearView}>
                검색·필터 해제
              </button>
            </div>
          )}
        </div>

        {editable && (
          <div className={`table-block__actions${settingsOpen ? " table-block__actions--open" : ""}`}>
            <button type="button" onClick={addRow}>
              + 새 행
            </button>
            <button type="button" onClick={addColumn}>
              + 새 열
            </button>
            {editable && (
              <div className="table-block__settings-wrap" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="table-tool-btn"
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setMenu(null);
                    setColMenu(null);
                    setSettingsOpen((open) => !open);
                  }}
                >
                  보기 설정
                </button>
                {settingsOpen && (
                  <div className="table-popover table-settings" role="dialog" aria-label="표 보기 설정">
                    <label className="table-settings__row">
                      <span>표 너비</span>
                      <input
                        aria-label="표 너비"
                        type="range"
                        min="10"
                        max="100"
                        value={block.width ?? 100}
                        onChange={(e) => onPatch({ width: Number(e.target.value), colWidths: undefined })}
                      />
                      <span className="table-settings__value">{block.width ?? 100}%</span>
                    </label>
                    <label className="table-settings__row">
                      <span>표 정렬</span>
                      <select aria-label="표 정렬" value={block.align ?? "left"} onChange={(e) => onPatch({ align: e.target.value as TableBlock["align"] })}>
                        <option value="left">왼쪽</option>
                        <option value="center">가운데</option>
                        <option value="right">오른쪽</option>
                      </select>
                    </label>
                    <div className="table-settings__row">
                      <label htmlFor={`${block.id}-font-pt`}>글자 크기</label>
                      <span className="table-settings__inline">
                        <input
                          id={`${block.id}-font-pt`}
                          aria-label="글자 크기 (pt)"
                          type="number"
                          min="1"
                          max="200"
                          step="0.5"
                          value={fontSizeInput}
                          onChange={(e) => setFontSizeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              applyFontSize();
                            }
                          }}
                        />
                        pt
                        <button type="button" className="table-tool-btn" onClick={applyFontSize} disabled={!fontSizeValid}>
                          적용
                        </button>
                      </span>
                    </div>
                    <p className="table-settings__hint">
                      {selection ? "선택한 셀에 적용됩니다." : "표 전체에 적용됩니다."}
                      {selection && (
                        <button type="button" className="table-settings__link" onClick={() => setSelection(null)}>
                          표 전체로 바꾸기
                        </button>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {colMenu && colMenu.c < colCount && (
          <div
            className="table-popover table-colmenu"
            role="dialog"
            aria-label={`${headerName(colMenu.c)} 열 옵션`}
            style={{ left: colMenu.x, top: colMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-pressed={sort?.col === colMenu.c && sort.dir === "asc"}
              onClick={() => setSort({ col: colMenu.c, dir: "asc" })}
            >
              오름차순 정렬
            </button>
            <button
              type="button"
              aria-pressed={sort?.col === colMenu.c && sort.dir === "desc"}
              onClick={() => setSort({ col: colMenu.c, dir: "desc" })}
            >
              내림차순 정렬
            </button>
            {sort?.col === colMenu.c && (
              <button type="button" onClick={() => setSort(null)}>
                정렬 해제
              </button>
            )}
            <div className="table-colmenu__sep" />
            <label className="table-colmenu__filter">
              <span>이 열에서 필터</span>
              <input
                type="search"
                autoFocus
                placeholder="포함할 내용"
                value={filters[colMenu.c] ?? ""}
                onChange={(e) => setFilter(colMenu.c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setColMenu(null);
                }}
              />
            </label>
            {filters[colMenu.c]?.trim() && (
              <button type="button" onClick={() => clearFilter(colMenu.c)}>
                필터 지우기
              </button>
            )}
            {editable && (
              <>
                <div className="table-colmenu__sep" />
                <button type="button" onClick={() => insertColumnAt(colMenu.c)}>
                  왼쪽에 열 추가
                </button>
                <button type="button" onClick={() => insertColumnAt(colMenu.c + 1)}>
                  오른쪽에 열 추가
                </button>
                <button type="button" className="table-colmenu__danger" disabled={colCount <= 1} onClick={() => removeColumns([colMenu.c])}>
                  열 삭제
                </button>
              </>
            )}
          </div>
        )}

        {menu && selection && (
          <div className="table-popover table-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {!isRange && (
              <button type="button" onClick={() => insertRowBelow(selection.rowIds[0])}>
                아래에 행 추가
              </button>
            )}
            <button type="button" onClick={() => removeRows(selection)} disabled={rows.length - selection.rowIds.length < 1}>
              행 삭제
            </button>
            <button type="button" onClick={() => removeColumns(selection.columnIds)} disabled={colCount - selection.columnIds.length < 1}>
              열 삭제
            </button>
            {isRange && (
              <button type="button" onClick={() => mergeRange(selection)}>
                선택한 셀 합치기
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearRange(selection);
                setMenu(null);
              }}
            >
              선택 내용 지우기
            </button>
            <div className="table-context-menu__label">글자색</div>
            <div className="table-context-menu__row">
              {TEXT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="table-context-menu__swatch"
                  style={{ background: c }}
                  aria-label={`글자색 ${c}`}
                  onClick={() => applyStyle(selection, { color: c })}
                />
              ))}
            </div>
            <div className="table-context-menu__label">배경색</div>
            <div className="table-context-menu__row">
              {BG_SWATCHES.map((c) => (
                <button
                  key={c ?? "none"}
                  type="button"
                  className="table-context-menu__swatch table-context-menu__swatch--bg"
                  style={{ background: c ?? "var(--color-surface)" }}
                  title={c ?? "배경 없음"}
                  aria-label={c ? `배경색 ${c}` : "배경 없음"}
                  onClick={() => applyStyle(selection, { bg: c ?? undefined })}
                />
              ))}
            </div>
            <div className="table-context-menu__label">글자 크기</div>
            <div className="table-context-menu__row">
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "sm", fontSizePt: undefined })}>
                작게
              </button>
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "md", fontSizePt: undefined })}>
                보통
              </button>
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "lg", fontSizePt: undefined })}>
                크게
              </button>
            </div>
          </div>
        )}
      </div>
      {editable && (
        <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거" aria-label="표 블록 제거">
          ✕
        </button>
      )}
    </div>
  );
}
