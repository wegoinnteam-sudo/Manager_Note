import type { PageBlock } from "@shared/types";

/**
 * Converts clipboard HTML (e.g. copied from Notion) into this editor's own
 * block model, mapping headings/lists/quotes/tables/code to the matching
 * block type and inline bold/italic/underline/strikethrough/code/links to
 * this app's markdown-ish text syntax (see inlineMarkdown.tsx). This is a
 * structural/formatting translation, not a pixel-for-pixel style copy — the
 * result renders in this app's own fonts and layout.
 */

function newId(): string {
  return crypto.randomUUID();
}

const INLINE_WRAP: Record<string, [string, string]> = {
  STRONG: ["**", "**"],
  B: ["**", "**"],
  EM: ["*", "*"],
  I: ["*", "*"],
  U: ["__", "__"],
  S: ["~", "~"],
  STRIKE: ["~", "~"],
  DEL: ["~", "~"],
};

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  if (el.tagName === "BR") return "\n";
  if (el.tagName === "CODE" && !el.closest("pre")) {
    const text = el.textContent ?? "";
    return text ? `\`${text}\`` : "";
  }
  if (el.tagName === "A") {
    const href = el.getAttribute("href") ?? "";
    const label = Array.from(el.childNodes).map(inlineText).join("");
    return /^https?:\/\//i.test(href) && label.trim() ? `[${label}](${href})` : label;
  }
  const inner = Array.from(el.childNodes).map(inlineText).join("");
  const wrap = INLINE_WRAP[el.tagName];
  return wrap && inner.trim() ? `${wrap[0]}${inner}${wrap[1]}` : inner;
}

function headingBlock(level: 1 | 2 | 3, text: string): PageBlock {
  return { id: newId(), type: level === 1 ? "heading1" : level === 2 ? "heading2" : "heading3", text };
}
function paragraphBlock(text: string): PageBlock {
  return { id: newId(), type: "paragraph", text };
}
function quoteBlock(text: string): PageBlock {
  return { id: newId(), type: "quote", text };
}
function codeBlock(text: string): PageBlock {
  return { id: newId(), type: "code", text, language: "plain" };
}
function dividerBlock(): PageBlock {
  return { id: newId(), type: "divider" };
}
function tableBlock(rows: string[][]): PageBlock {
  return { id: newId(), type: "table", rows };
}

function listItemsToBlocks(listEl: HTMLElement): PageBlock[] {
  const ordered = listEl.tagName === "OL";
  const blocks: PageBlock[] = [];
  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== "LI") continue;
    const checkbox = li.querySelector("input[type=checkbox]") as HTMLInputElement | null;
    const nestedLists: HTMLElement[] = [];
    let text = "";
    for (const child of Array.from(li.childNodes)) {
      const tag = child.nodeType === Node.ELEMENT_NODE ? (child as HTMLElement).tagName : "";
      if (tag === "UL" || tag === "OL") {
        nestedLists.push(child as HTMLElement);
        continue;
      }
      if (tag === "INPUT") continue;
      text += inlineText(child);
    }
    text = text.trim();
    if (checkbox) blocks.push({ id: newId(), type: "checklist_item", text, checked: checkbox.checked });
    else if (ordered) blocks.push({ id: newId(), type: "numbered_list_item", text });
    else blocks.push({ id: newId(), type: "bulleted_list_item", text });
    // Nested lists lose their indent level here (this editor's list blocks
    // are flat) but their items still come through as sibling blocks.
    for (const nested of nestedLists) blocks.push(...listItemsToBlocks(nested));
  }
  return blocks;
}

function elementToBlocks(el: HTMLElement): PageBlock[] {
  switch (el.tagName) {
    case "H1":
      return [headingBlock(1, inlineText(el).trim())];
    case "H2":
      return [headingBlock(2, inlineText(el).trim())];
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return [headingBlock(3, inlineText(el).trim())];
    case "P": {
      const text = inlineText(el).trim();
      return text ? [paragraphBlock(text)] : [];
    }
    case "UL":
    case "OL":
      return listItemsToBlocks(el);
    case "BLOCKQUOTE": {
      const text = inlineText(el).trim();
      return text ? [quoteBlock(text)] : [];
    }
    case "HR":
      return [dividerBlock()];
    case "PRE": {
      const text = (el.textContent ?? "").replace(/\n$/, "");
      return text.trim() ? [codeBlock(text)] : [];
    }
    case "TABLE": {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => inlineText(cell).trim()),
      );
      return rows.length ? [tableBlock(rows)] : [];
    }
    // Notion (and most rich-text sources) wrap actual content in structural
    // containers — recurse into these rather than treating the wrapper
    // itself as a block.
    case "DIV":
    case "SECTION":
    case "ARTICLE":
    case "FIGURE":
      return Array.from(el.children).flatMap((child) => elementToBlocks(child as HTMLElement));
    default: {
      const text = inlineText(el).trim();
      return text ? [paragraphBlock(text)] : [];
    }
  }
}

export function htmlToBlocks(html: string): PageBlock[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children).flatMap((el) => elementToBlocks(el as HTMLElement));
}
