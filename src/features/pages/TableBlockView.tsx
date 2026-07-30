import { useEffect, useRef, useState } from "react";
import type { PageBlock } from "@shared/types";

type TableBlock = Extract<PageBlock, { type: "table" }>;
type CellPos = { r: number; c: number };
type Selection = { r1: number; c1: number; r2: number; c2: number };
type FontSize = "sm" | "md" | "lg";

const FONT_SIZE_PX: Record<FontSize, number> = { sm: 12, md: 13, lg: 16 };
const DEFAULT_COL_WIDTH = 140;
const TEXT_SWATCHES = ["#111827", "#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed"];
const BG_SWATCHES = [null, "#fef3c7", "#dcfce7", "#dbeafe", "#fee2e2", "#ede9fe"];

function normalize(a: CellPos, b: CellPos): Selection {
  return { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) };
}
function inSelection(sel: Selection | null, r: number, c: number): boolean {
  return !!sel && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
}
function cellKey(r: number, c: number): string {
  return `${r}-${c}`;
}

export function TableBlockView({
  block,
  editable,
  onPatch,
  onRemoveBlock,
  onInsertParagraphAfter,
}: {
  block: TableBlock;
  editable: boolean;
  onPatch: (patch: Partial<PageBlock>) => void;
  onRemoveBlock: () => void;
  onInsertParagraphAfter: () => void;
}) {
  const rows = block.rows;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const anchorRef = useRef<CellPos | null>(null);
  const draggingRef = useRef(false);
  const resizeRef = useRef<{ c: number; startX: number; startWidth: number; pointerId: number } | null>(null);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingCellFocusRef = useRef<CellPos | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;

  const isRange = !!selection && (selection.r1 !== selection.r2 || selection.c1 !== selection.c2);

  useEffect(() => {
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // A real multi-cell drag still leaves the anchor cell's <input> focused
      // (native click-to-focus on mousedown) — blur it so the Delete/Backspace
      // listener below (which defers to normal in-input editing whenever an
      // input is focused) is free to clear the whole selected range instead.
      const sel = selectionRef.current;
      if (sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) && document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  useEffect(() => {
    const pending = pendingCellFocusRef.current;
    if (!pending) return;
    const input = cellRefs.current.get(cellKey(pending.r, pending.c));
    if (!input) return;
    pendingCellFocusRef.current = null;
    input.focus();
    input.select();
  }, [rows]);

  useEffect(() => {
    if (!isRange || !selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        clearRange(selection);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRange, selection, rows]);

  const updateCell = (r: number, c: number, value: string) => {
    onPatch({ rows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)) });
  };

  const clearRange = (sel: Selection) => {
    onPatch({
      rows: rows.map((row, ri) =>
        ri >= sel.r1 && ri <= sel.r2 ? row.map((cell, ci) => (ci >= sel.c1 && ci <= sel.c2 ? "" : cell)) : row,
      ),
    });
  };

  const mergeRange = (sel: Selection) => {
    const parts: string[] = [];
    for (let r = sel.r1; r <= sel.r2; r++) {
      for (let c = sel.c1; c <= sel.c2; c++) {
        if (rows[r][c]) parts.push(rows[r][c]);
      }
    }
    const joined = parts.join(" ");
    onPatch({
      rows: rows.map((row, ri) =>
        ri >= sel.r1 && ri <= sel.r2
          ? row.map((cell, ci) => (ci >= sel.c1 && ci <= sel.c2 ? (ri === sel.r1 && ci === sel.c1 ? joined : "") : cell))
          : row,
      ),
    });
    setSelection({ r1: sel.r1, c1: sel.c1, r2: sel.r1, c2: sel.c1 });
    setMenu(null);
  };

  const addRow = () => onPatch({ rows: [...rows, rows[0].map(() => "")] });
  const addColumn = () => onPatch({ rows: rows.map((row) => [...row, ""]) });
  const removeRow = (r: number) => rows.length > 1 && onPatch({ rows: rows.filter((_, ri) => ri !== r) });
  const removeColumn = (c: number) => rows[0].length > 1 && onPatch({ rows: rows.map((row) => row.filter((_, ci) => ci !== c)) });

  const removeRows = (sel: Selection) => {
    if (rows.length - (sel.r2 - sel.r1 + 1) < 1) return;
    onPatch({ rows: rows.filter((_, ri) => ri < sel.r1 || ri > sel.r2) });
    setSelection(null);
    setMenu(null);
  };
  const removeColumns = (sel: Selection) => {
    if (rows[0].length - (sel.c2 - sel.c1 + 1) < 1) return;
    onPatch({ rows: rows.map((row) => row.filter((_, ci) => ci < sel.c1 || ci > sel.c2)) });
    setSelection(null);
    setMenu(null);
  };

  const applyStyle = (sel: Selection, patch: Partial<{ color: string; bg: string | undefined; fontSize: FontSize }>) => {
    const next = { ...(block.cellStyles ?? {}) };
    for (let r = sel.r1; r <= sel.r2; r++) {
      for (let c = sel.c1; c <= sel.c2; c++) {
        const key = cellKey(r, c);
        next[key] = { ...next[key], ...patch };
      }
    }
    onPatch({ cellStyles: next });
  };

  const colWidth = (c: number) => block.colWidths?.[c] ?? DEFAULT_COL_WIDTH;

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, c: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { c, startX: e.clientX, startWidth: colWidth(c), pointerId: e.pointerId };
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

  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (!editable) return;
    if ((e.target as HTMLElement).classList.contains("table-block__col-resize")) return;
    anchorRef.current = { r, c };
    draggingRef.current = true;
    setSelection({ r1: r, c1: c, r2: r, c2: c });
  };
  const onCellMouseEnter = (r: number, c: number) => {
    if (!draggingRef.current || !anchorRef.current) return;
    setSelection(normalize(anchorRef.current, { r, c }));
  };
  const onCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
    if (!editable) return;
    e.preventDefault();
    if (!inSelection(selection, r, c)) {
      setSelection({ r1: r, c1: c, r2: r, c2: c });
    }
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const focusCell = (r: number, c: number) => {
    const input = cellRefs.current.get(cellKey(r, c));
    if (!input) return;
    input.focus();
    input.select();
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (r < rows.length - 1) {
        focusCell(r + 1, c);
        return;
      }
      pendingCellFocusRef.current = { r: rows.length, c };
      onPatch({ rows: [...rows, rows[0].map(() => "")] });
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (r < rows.length - 1) focusCell(r + 1, c);
      else onInsertParagraphAfter();
      return;
    }
    if (e.key === "ArrowUp" && r > 0) {
      e.preventDefault();
      focusCell(r - 1, c);
      return;
    }

    const caretStart = e.currentTarget.selectionStart ?? 0;
    const caretEnd = e.currentTarget.selectionEnd ?? 0;
    if (e.key === "ArrowRight" && caretStart === e.currentTarget.value.length && caretEnd === caretStart) {
      const nextColumn = c + 1;
      if (nextColumn < rows[r].length) {
        e.preventDefault();
        focusCell(r, nextColumn);
      } else if (r < rows.length - 1) {
        e.preventDefault();
        focusCell(r + 1, 0);
      }
    } else if (e.key === "ArrowLeft" && caretStart === 0 && caretEnd === 0) {
      if (c > 0) {
        e.preventDefault();
        focusCell(r, c - 1);
      } else if (r > 0) {
        e.preventDefault();
        focusCell(r - 1, rows[r - 1].length - 1);
      }
    }
  };

  return (
    <div className="block-row">
      <div className="table-block">
        <table style={{ tableLayout: "fixed" }}>
          <colgroup>
            {rows[0].map((_, c) => (
              <col key={c} style={{ width: colWidth(c) }} />
            ))}
            {editable && <col style={{ width: 20 }} />}
          </colgroup>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const style = block.cellStyles?.[cellKey(r, c)];
                  return (
                    <td
                      key={c}
                      className={isRange && inSelection(selection, r, c) ? "table-block__cell--selected" : undefined}
                      style={{ background: style?.bg, position: "relative" }}
                      onMouseDown={(e) => onCellMouseDown(r, c, e)}
                      onMouseEnter={() => onCellMouseEnter(r, c)}
                      onContextMenu={(e) => onCellContextMenu(e, r, c)}
                    >
                      {editable ? (
                        <input
                          ref={(input) => {
                            const key = cellKey(r, c);
                            if (input) cellRefs.current.set(key, input);
                            else cellRefs.current.delete(key);
                          }}
                          value={cell}
                          onChange={(e) => updateCell(r, c, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                          style={{ color: style?.color, fontSize: FONT_SIZE_PX[style?.fontSize ?? "md"] }}
                        />
                      ) : (
                        <span style={{ color: style?.color, fontSize: FONT_SIZE_PX[style?.fontSize ?? "md"] }}>{cell}</span>
                      )}
                      {editable && r === 0 && (
                        <span
                          className="table-block__col-resize"
                          onPointerDown={(e) => startResize(e, c)}
                          onPointerMove={doResize}
                          onPointerUp={stopResize}
                          onPointerCancel={stopResize}
                        />
                      )}
                    </td>
                  );
                })}
                {editable && (
                  <td className="table-block__row-actions">
                    <button type="button" onClick={() => removeRow(r)} title="행 삭제">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {editable && (
              <tr>
                {rows[0].map((_, c) => (
                  <td key={c} className="table-block__col-actions">
                    <button type="button" onClick={() => removeColumn(c)} title="열 삭제">
                      ✕
                    </button>
                  </td>
                ))}
                <td />
              </tr>
            )}
          </tbody>
        </table>
        {editable && (
          <div className="table-block__actions">
            <button type="button" onClick={addRow}>
              + 행
            </button>
            <button type="button" onClick={addColumn}>
              + 열
            </button>
          </div>
        )}
        {menu && selection && (
          <div className="table-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => removeRows(selection)}>
              🗑 행 삭제
            </button>
            <button type="button" onClick={() => removeColumns(selection)}>
              🗑 열 삭제
            </button>
            {isRange && (
              <button type="button" onClick={() => mergeRange(selection)}>
                🔗 선택 병합·합치기
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
                  onClick={() => applyStyle(selection, { bg: c ?? undefined })}
                />
              ))}
            </div>
            <div className="table-context-menu__label">글자 크기</div>
            <div className="table-context-menu__row">
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "sm" })}>
                작게
              </button>
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "md" })}>
                보통
              </button>
              <button type="button" onClick={() => applyStyle(selection, { fontSize: "lg" })}>
                크게
              </button>
            </div>
          </div>
        )}
      </div>
      {editable && (
        <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
          ✕
        </button>
      )}
    </div>
  );
}
