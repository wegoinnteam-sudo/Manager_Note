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
function toggleBlock(text: string): PageBlock {
  return { id: newId(), type: "toggle", text, body: "", expanded: true };
}

// This editor's list blocks are flat (no parent/child link) but every block
// does carry an optional `indent` used elsewhere for Tab/Shift+Tab — reuse
// that same field to preserve Notion's nesting depth on paste.
function withIndent(block: PageBlock, indent: number): PageBlock {
  return indent > 0 ? { ...block, indent } : block;
}

// Notion nests a list item's child blocks (sub-lists, but also tables,
// quotes, code blocks, headings...) directly inside its <li>. Any of these
// must become their own sibling block instead of being swept into the list
// item's own inline text by the generic text accumulation below.
const NESTED_BLOCK_TAGS = new Set(["UL", "OL", "TABLE", "BLOCKQUOTE", "PRE", "HR", "H1", "H2", "H3", "H4", "H5", "H6"]);

function listItemsToBlocks(listEl: HTMLElement, indent = 0): PageBlock[] {
  const ordered = listEl.tagName === "OL";
  const blocks: PageBlock[] = [];
  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== "LI") continue;
    const checkbox = li.querySelector("input[type=checkbox]") as HTMLInputElement | null;
    const nestedBlocks: HTMLElement[] = [];
    let text = "";
    for (const child of Array.from(li.childNodes)) {
      const tag = child.nodeType === Node.ELEMENT_NODE ? (child as HTMLElement).tagName : "";
      if (NESTED_BLOCK_TAGS.has(tag)) {
        nestedBlocks.push(child as HTMLElement);
        continue;
      }
      if (tag === "INPUT") continue;
      text += inlineText(child);
    }
    text = text.trim();
    // Notion's own toggle lists export identically to an ordinary nested
    // bullet (a <li> with a nested block inside it) — there is no HTML
    // marker distinguishing the two — so any plain bullet that has nested
    // content becomes a toggle here, foldable the same way a real Notion
    // toggle is. Numbered/checklist items keep their own type regardless,
    // since folding would erase their ordering/checked-state meaning.
    if (checkbox) blocks.push(withIndent({ id: newId(), type: "checklist_item", text, checked: checkbox.checked }, indent));
    else if (ordered) blocks.push(withIndent({ id: newId(), type: "numbered_list_item", text }, indent));
    else if (nestedBlocks.length > 0) blocks.push(withIndent(toggleBlock(text), indent));
    else blocks.push(withIndent({ id: newId(), type: "bulleted_list_item", text }, indent));
    // Nested content renders as ordinary sibling blocks one indent level
    // deeper — a collapsed toggle above hides them by indent, not by
    // containment (see Editor.tsx's hiddenBlockIds computation).
    for (const nested of nestedBlocks) {
      if (nested.tagName === "UL" || nested.tagName === "OL") blocks.push(...listItemsToBlocks(nested, indent + 1));
      else blocks.push(...elementToBlocks(nested, indent + 1));
    }
  }
  return blocks;
}

function elementToBlocks(el: HTMLElement, indent = 0): PageBlock[] {
  switch (el.tagName) {
    case "H1":
      return [withIndent(headingBlock(1, inlineText(el).trim()), indent)];
    case "H2":
      return [withIndent(headingBlock(2, inlineText(el).trim()), indent)];
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return [withIndent(headingBlock(3, inlineText(el).trim()), indent)];
    case "P": {
      const text = inlineText(el).trim();
      return text ? [withIndent(paragraphBlock(text), indent)] : [];
    }
    case "UL":
    case "OL":
      return listItemsToBlocks(el, indent);
    case "BLOCKQUOTE": {
      const text = inlineText(el).trim();
      return text ? [withIndent(quoteBlock(text), indent)] : [];
    }
    case "HR":
      return [withIndent(dividerBlock(), indent)];
    case "PRE": {
      const text = (el.textContent ?? "").replace(/\n$/, "");
      return text.trim() ? [withIndent(codeBlock(text), indent)] : [];
    }
    case "TABLE": {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) => inlineText(cell).trim()),
      );
      return rows.length ? [withIndent(tableBlock(rows), indent)] : [];
    }
    // Notion (and most rich-text sources) wrap actual content in structural
    // containers — recurse into these rather than treating the wrapper
    // itself as a block.
    case "DIV":
    case "SECTION":
    case "ARTICLE":
    case "FIGURE":
      return Array.from(el.children).flatMap((child) => elementToBlocks(child as HTMLElement, indent));
    default: {
      const text = inlineText(el).trim();
      return text ? [withIndent(paragraphBlock(text), indent)] : [];
    }
  }
}

export function htmlToBlocks(html: string): PageBlock[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children).flatMap((el) => elementToBlocks(el as HTMLElement));
}
