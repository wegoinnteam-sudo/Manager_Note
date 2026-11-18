import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PageBlock } from "@shared/types";
import { pageContentSchema } from "../../../worker/lib/validation";
import { TableBlockView } from "./TableBlockView";
import { TABLE_PRESETS, tableNeedsWidePage } from "./tableDefaults";

type Table = Extract<PageBlock, { type: "table" }>;
const initial: Table = { id: "table", type: "table", rows: [["A", "B"], ["C", "D"]] };

let latest: Table = initial;
function Harness({ start = initial, editable = true, autoFocus = false }: { start?: Table; editable?: boolean; autoFocus?: boolean }) {
  const [block, setBlock] = useState(start);
  latest = block;
  return (
    <TableBlockView
      block={block}
      editable={editable}
      onPatch={(patch) => setBlock((prev) => ({ ...prev, ...patch } as Table))}
      onRemoveBlock={() => {}}
      onInsertParagraphAfter={() => {}}
      autoFocus={autoFocus}
    />
  );
}

/** Click a cell (mousedown + mouseup, no drag) — opens it for editing. */
function clickCell(text: string) {
  const cell = screen.getByText(text);
  fireEvent.mouseDown(cell, { button: 0 });
  act(() => {
    fireEvent.mouseUp(window);
  });
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
}

describe("table formatting", () => {
  it("applies pt sizes to a selected cell or the entire table", () => {
    render(<Harness />);
    clickCell("A");
    const editor = screen.getByDisplayValue("A");
    openSettings();
    fireEvent.change(screen.getByLabelText("글자 크기 (pt)"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("적용"));
    expect(editor).toHaveStyle({ fontSize: "1pt" });
    expect(screen.getByText("B")).toHaveStyle({ fontSize: "13px" });
    fireEvent.click(screen.getByText("표 전체로 바꾸기"));
    fireEvent.change(screen.getByLabelText("글자 크기 (pt)"), { target: { value: "10.5" } });
    fireEvent.click(screen.getByText("적용"));
    for (const key of ["0-0", "0-1", "1-0", "1-1"]) expect(latest.cellStyles?.[key]?.fontSizePt).toBe(10.5);
  });

  it("resizes and centers the table", () => {
    const { container } = render(<Harness />);
    openSettings();
    fireEvent.change(screen.getByLabelText("표 너비"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("표 정렬"), { target: { value: "center" } });
    expect(container.querySelector(".table-block")).toHaveStyle({ width: "60%", marginLeft: "auto", marginRight: "auto" });
  });

  it("preserves formatting through server validation and rejects invalid sizes", () => {
    const block = { ...initial, width: 60, align: "center", cellStyles: { "0-0": { fontSizePt: 10.5 } } };
    expect(pageContentSchema.parse({ blocks: [block] }).blocks[0]).toEqual(block);
    expect(pageContentSchema.safeParse({ blocks: [{ ...block, cellStyles: { "0-0": { fontSizePt: 0 } } }] }).success).toBe(false);
    expect(pageContentSchema.parse({ blocks: [initial] }).blocks[0]).toEqual(initial);
  });
});

describe("table editing", () => {
  it("edits a cell in place and saves through onPatch", () => {
    render(<Harness />);
    clickCell("C");
    fireEvent.change(screen.getByDisplayValue("C"), { target: { value: "101호" } });
    expect(latest.rows).toEqual([["A", "B"], ["101호", "D"]]);
  });

  it("moves with Tab / Enter and leaves edit mode with Esc", () => {
    render(<Harness />);
    clickCell("A");
    fireEvent.keyDown(screen.getByDisplayValue("A"), { key: "Tab" });
    const b = screen.getByDisplayValue("B");
    fireEvent.keyDown(b, { key: "Enter" });
    const d = screen.getByDisplayValue("D");
    fireEvent.keyDown(d, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /셀$/ })).toBeNull();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("moves up and down in the same column from inside multiline cells", () => {
    const start = { ...initial, rows: [...initial.rows, ["E", "first\nsecond\nthird"], ["F", "last"]] };
    render(<Harness start={start} />);
    clickCell("first second third");
    const editor = screen.getByDisplayValue("first second third") as HTMLTextAreaElement;
    editor.setSelectionRange(7, 7);
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(screen.getByDisplayValue("last")).toHaveFocus();
    fireEvent.keyDown(screen.getByDisplayValue("last"), { key: "ArrowUp" });
    const multiline = screen.getByDisplayValue("first second third") as HTMLTextAreaElement;
    multiline.setSelectionRange(7, 7);
    fireEvent.keyDown(multiline, { key: "ArrowUp" });
    expect(screen.getByDisplayValue("D")).toHaveFocus();
  });

  it("keeps a drag within a displayed cell from opening the cell editor", () => {
    const { container } = render(<Harness />);
    const table = container.querySelector<HTMLElement>("[data-table-selection]")!;
    table.getBoundingClientRect = () => new DOMRect(0, 0, 200, 60);
    const cell = screen.getByText("A").closest("td")!;
    cell.getBoundingClientRect = () => new DOMRect(0, 0, 100, 30);
    fireEvent.mouseDown(cell, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 30, clientY: 10 });

    expect(cell).toHaveClass("table-block__cell--selected");
    expect(screen.queryByDisplayValue("A")).toBeNull();
  });

  it("adds a row when Enter is pressed on the last row", () => {
    render(<Harness />);
    clickCell("D");
    fireEvent.keyDown(screen.getByDisplayValue("D"), { key: "Enter" });
    expect(latest.rows).toEqual([["A", "B"], ["C", "D"], ["", ""]]);
  });

  it("keeps Shift+Enter for a line break inside the cell", () => {
    render(<Harness />);
    clickCell("C");
    const editor = screen.getByDisplayValue("C");
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    expect(latest.rows.length).toBe(2);
    expect(screen.getByDisplayValue("C")).toBe(editor);
  });
});

describe("table view tools", () => {
  const rooms: Table = {
    id: "rooms",
    type: "table",
    rows: [
      ["객실", "상태"],
      ["203", "수리 중"],
      ["101", "완료"],
      ["302", "접수"],
      ["110", ""],
      ["205", "완료"],
      ["301", "수리 중"],
    ],
  };

  const bodyOrder = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("tbody tr:not(.table-block__head)")).map(
      (tr) => tr.querySelector("td")?.textContent,
    );

  it("sorts, filters and searches without changing stored rows", () => {
    const { container } = render(<Harness start={rooms} />);
    fireEvent.click(screen.getByRole("button", { name: "객실 열 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "오름차순 정렬" }));
    expect(bodyOrder(container)).toEqual(["101", "110", "203", "205", "301", "302"]);

    fireEvent.click(screen.getByRole("button", { name: "상태 열 메뉴" }));
    const menu = screen.getByRole("dialog", { name: "상태 열 옵션" });
    fireEvent.change(within(menu).getByPlaceholderText("포함할 내용"), { target: { value: "완료" } });
    expect(bodyOrder(container)).toEqual(["101", "205"]);

    fireEvent.click(screen.getByRole("button", { name: "모두 해제" }));
    fireEvent.change(screen.getByLabelText("표에서 검색"), { target: { value: "30" } });
    expect(bodyOrder(container)).toEqual(["302", "301"]);

    expect(latest.rows).toEqual(rooms.rows);
  });

  it("drags across visible rows from an open editor and clears only those cells", () => {
    const { container } = render(<Harness start={rooms} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "표에서 검색" }), { target: { value: "완료" } });
    fireEvent.click(screen.getByRole("button", { name: "객실 열 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "내림차순 정렬" }));
    clickCell("205");
    const table = container.querySelector<HTMLElement>("[data-table-selection]")!;
    table.getBoundingClientRect = () => new DOMRect(0, 0, 200, 90);
    const cells = table.querySelectorAll<HTMLElement>("[data-table-cell]");
    cells.forEach((cell, index) => {
      cell.getBoundingClientRect = () => new DOMRect((index % 2) * 100, Math.floor(index / 2) * 30, 100, 30);
    });
    const editor = screen.getByDisplayValue("205");
    fireEvent.mouseDown(editor, { button: 0, clientX: 15, clientY: 40 });
    fireEvent.mouseMove(window, { clientX: 15, clientY: 85 });
    fireEvent.mouseUp(window, { clientX: 15, clientY: 110 });

    expect(container.querySelectorAll(".table-block__cell--selected")).toHaveLength(2);
    const anchor = screen.getByText("205");
    fireEvent.keyDown(anchor, { key: "Delete" });
    expect(latest.rows.map((row) => row[0])).toEqual(["객실", "203", "", "302", "110", "", "301"]);
  });

  it("shows status words as pills and keeps empty cells blank", () => {
    const { container } = render(<Harness start={rooms} editable={false} />);
    expect(screen.getAllByText("완료")[0]).toHaveClass("table-block__status--done");
    expect(screen.getAllByText("수리 중")[0]).toHaveClass("table-block__status--progress");
    expect(screen.getByText("객실")).not.toHaveClass("table-block__status");
    const blank = container.querySelector('[data-cell="4-1"]');
    expect(blank?.textContent).toBe("");
  });
});

describe("new tables (/표)", () => {
  const blank: Table = { id: "new", type: "table", ...TABLE_PRESETS.blank() };

  it("starts as a 3-column table with header hints and opens the first header cell", () => {
    render(<Harness start={blank} autoFocus />);
    expect(latest.rows).toEqual([["", "", ""], ["", "", ""], ["", "", ""]]);
    const editor = screen.getByRole("textbox", { name: "열 1 이름" });
    expect(editor).toHaveFocus();
    expect(editor).toHaveAttribute("placeholder", "열 1");
    expect(screen.getByText("열 2")).toHaveClass("table-block__placeholder");
  });

  it("opens the first body cell for presets that already name their columns", () => {
    render(<Harness start={{ id: "rooms", type: "table", ...TABLE_PRESETS.rooms() }} autoFocus />);
    expect(screen.getByRole("textbox", { name: "객실 번호 셀" })).toHaveFocus();
  });

  it("keeps header hints out of the saved data", () => {
    render(<Harness start={blank} />);
    expect(latest.rows[0]).toEqual(["", "", ""]);
  });

  it("sizes to its columns and only widens the page when it has to", () => {
    const { container } = render(<Harness start={blank} />);
    expect(container.querySelector("table")).toHaveStyle({ width: "480px" });
    expect(tableNeedsWidePage(blank)).toBe(false);
    expect(tableNeedsWidePage({ id: "w", type: "table", ...TABLE_PRESETS.rooms() })).toBe(true);
    expect(tableNeedsWidePage({ ...blank, width: 80 })).toBe(true);
  });

  it("drops the row and column delete buttons from the grid", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".table-block__row-actions, .table-block__col-actions")).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("inserts and deletes columns from the header menu, keeping widths and cell styles aligned", () => {
    const start: Table = { id: "t", type: "table", rows: [["A", "B"], ["C", "D"]], colWidths: [100, 200], cellStyles: { "1-1": { color: "#dc2626" } } };
    render(<Harness start={start} />);
    fireEvent.click(screen.getByRole("button", { name: "B 열 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "왼쪽에 열 추가" }));
    expect(latest.rows).toEqual([["A", "", "B"], ["C", "", "D"]]);
    expect(latest.colWidths).toEqual([100, 160, 200]);
    expect(latest.cellStyles).toEqual({ "1-2": { color: "#dc2626" } });

    fireEvent.click(screen.getByRole("button", { name: "A 열 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "열 삭제" }));
    expect(latest.rows).toEqual([["", "B"], ["", "D"]]);
    expect(latest.colWidths).toEqual([160, 200]);
    expect(latest.cellStyles).toEqual({ "1-1": { color: "#dc2626" } });
  });

  it("adds a row below from the right-click menu", () => {
    render(<Harness start={{ id: "t", type: "table", rows: [["A", "B"], ["C", "D"], ["E", "F"]] }} />);
    fireEvent.contextMenu(screen.getByText("C"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("button", { name: "아래에 행 추가" }));
    expect(latest.rows).toEqual([["A", "B"], ["C", "D"], ["", ""], ["E", "F"]]);
  });
});
