import type { PageBlock, PageContent } from "../../shared/types";

function readBlocks(contentJson: string | null | undefined): PageBlock[] {
  try {
    const blocks = contentJson ? JSON.parse(contentJson)?.blocks : undefined;
    return Array.isArray(blocks)
      ? blocks.filter((block) => block && typeof block.id === "string" && typeof block.type === "string")
      : [];
  } catch {
    return [];
  }
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tableRows(rows: unknown): unknown[][] {
  return Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? row : []) : [];
}

function hasContent(block: PageBlock): boolean {
  if (block.type === "toggle") return !!(textValue(block.text) || textValue(block.body));
  if ("text" in block) return !!textValue(block.text);
  if (block.type === "table") return tableRows(block.rows).some((row) => row.some(textValue));
  if (block.type === "image") return !!(block.attachmentId || block.url);
  return true;
}

export function isPageContentEmpty(contentJson: string | null | undefined): boolean {
  return !readBlocks(contentJson).some(hasContent);
}

export function hasRemovedPageContent(previousJson: string, next: PageContent): boolean {
  const nextBlocks = new Map(next.blocks.map((block) => [block.id, block]));
  return readBlocks(previousJson).some((block) => {
    if (!hasContent(block)) return false;
    const updated = nextBlocks.get(block.id);
    if (!updated || !hasContent(updated)) return true;
    if (block.type === "toggle" && updated.type === "toggle") {
      return !!((textValue(block.text) && !textValue(updated.text)) ||
        (textValue(block.body) && !textValue(updated.body)));
    }
    if (block.type === "table" && updated.type === "table") {
      return tableRows(block.rows).some((row, rowIndex) =>
        row.some((cell, colIndex) => textValue(cell) && !textValue(updated.rows[rowIndex]?.[colIndex])),
      );
    }
    return false;
  });
}
