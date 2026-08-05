import { describe, it, expect } from "vitest";
import { htmlToBlocks } from "./notionPaste";

describe("htmlToBlocks", () => {
  it("maps headings, paragraphs and inline formatting to this editor's block/markdown syntax", () => {
    const html = `
      <h1>제목</h1>
      <p>이것은 <strong>굵게</strong>와 <em>기울임</em>과 <a href="https://example.com">링크</a>입니다.</p>
    `;
    const blocks = htmlToBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "heading1", text: "제목" });
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      text: "이것은 **굵게**와 *기울임*과 [링크](https://example.com)입니다.",
    });
  });

  it("splits a bulleted list into one block per item", () => {
    const html = "<ul><li>첫째</li><li>둘째</li></ul>";
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([
      expect.objectContaining({ type: "bulleted_list_item", text: "첫째" }),
      expect.objectContaining({ type: "bulleted_list_item", text: "둘째" }),
    ]);
  });

  it("recognizes a to-do list item's checkbox state", () => {
    const html = '<ul><li><input type="checkbox" checked>완료됨</li><li><input type="checkbox">미완료</li></ul>';
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([
      expect.objectContaining({ type: "checklist_item", text: "완료됨", checked: true }),
      expect.objectContaining({ type: "checklist_item", text: "미완료", checked: false }),
    ]);
  });

  it("converts a table into a table block with matching rows", () => {
    const html = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>";
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([
      expect.objectContaining({
        type: "table",
        rows: [
          ["A", "B"],
          ["1", "2"],
        ],
      }),
    ]);
  });

  it("recurses into wrapper divs instead of treating them as a block", () => {
    const html = "<div><div><p>안쪽 문단</p></div></div>";
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([expect.objectContaining({ type: "paragraph", text: "안쪽 문단" })]);
  });

  it("drops empty paragraphs", () => {
    const html = "<p></p><p>내용</p><p><br></p>";
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([expect.objectContaining({ type: "paragraph", text: "내용" })]);
  });
});
