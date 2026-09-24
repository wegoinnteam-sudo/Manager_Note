import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PageBlock } from "@shared/types";
import { pageContentSchema } from "../../../worker/lib/validation";
import { TableBlockView } from "./TableBlockView";

type Table = Extract<PageBlock, { type: "table" }>;
const initial: Table = { id: "table", type: "table", rows: [["A", "B"], ["C", "D"]] };
function Harness() {
  const [block, setBlock] = useState(initial);
  return <TableBlockView block={block} editable onPatch={(patch) => setBlock((prev) => ({ ...prev, ...patch } as Table))} onRemoveBlock={() => {}} onInsertParagraphAfter={() => {}} />;
}

describe("table formatting", () => {
  it("applies pt sizes to a selected cell or the entire table", () => {
    render(<Harness />);
    const cell = screen.getByDisplayValue("A");
    fireEvent.mouseDown(cell);
    fireEvent.mouseUp(window);
    fireEvent.change(screen.getByLabelText("글자 크기 (pt)"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("적용"));
    expect(cell).toHaveStyle({ fontSize: "1pt" });
    expect(screen.getByDisplayValue("B")).toHaveStyle({ fontSize: "13px" });
    fireEvent.click(screen.getByText("전체 셀 선택"));
    fireEvent.change(screen.getByLabelText("글자 크기 (pt)"), { target: { value: "10.5" } });
    fireEvent.click(screen.getByText("적용"));
    for (const value of ["A", "B", "C", "D"]) expect(screen.getByDisplayValue(value)).toHaveStyle({ fontSize: "10.5pt" });
  });

  it("resizes and centers the table", () => {
    const { container } = render(<Harness />);
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
