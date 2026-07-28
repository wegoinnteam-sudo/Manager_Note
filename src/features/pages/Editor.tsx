import { useCallback, useRef, useState } from "react";
import type { AttachmentDTO, PageBlock, PageContent, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import { Block, type HeadingRef } from "./Block";
import { AttachmentPicker } from "./AttachmentPicker";
import { TEMPLATES, buildTemplateBlocks, type TemplateKey } from "./templates";
import type { DatabaseViewType } from "./DatabaseView";
import { api } from "@/lib/api";

function newBlockId(): string {
  return crypto.randomUUID();
}

function emptyBlockOfType(type: PageBlock["type"]): PageBlock {
  const id = newBlockId();
  switch (type) {
    case "checklist_item":
      return { id, type, text: "", checked: false };
    case "divider":
      return { id, type };
    case "toggle":
      return { id, type, text: "", body: "", expanded: true };
    case "table":
      return { id, type, rows: [["", ""], ["", ""]] };
    case "toc":
      return { id, type };
    case "embed":
      return { id, type, url: "" };
    case "bookmark":
      return { id, type, url: "" };
    case "page_link":
      return { id, type, pageId: "" };
    case "columns":
      return { id, type, columns: ["", ""] };
    case "database_view":
      return { id, type, view: "table" };
    default:
      return { id, type: type as any, text: "" };
  }
}

type SlashCommandType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "checklist_item"
  | "divider"
  | "toggle"
  | "callout"
  | "table"
  | "toc"
  | "embed"
  | "bookmark"
  | "image"
  | "file"
  | "page_link"
  | "columns"
  | "template"
  | "db_table"
  | "db_board"
  | "db_gallery"
  | "db_calendar"
  | "db_list";

const DB_VIEW_BY_COMMAND: Partial<Record<SlashCommandType, DatabaseViewType>> = {
  db_table: "table",
  db_board: "board",
  db_gallery: "gallery",
  db_calendar: "calendar",
  db_list: "list",
};

const SLASH_COMMANDS: { label: string; type: SlashCommandType; aliases: string[] }[] = [
  { label: "텍스트", type: "paragraph", aliases: ["text"] },
  { label: "제목1", type: "heading1", aliases: ["heading 1", "h1"] },
  { label: "제목2", type: "heading2", aliases: ["heading 2", "h2"] },
  { label: "제목3", type: "heading3", aliases: ["heading 3", "h3"] },
  { label: "글머리표", type: "bulleted_list_item", aliases: ["bullet"] },
  { label: "번호 목록", type: "numbered_list_item", aliases: ["numbered"] },
  { label: "체크리스트", type: "checklist_item", aliases: ["to-do", "todo"] },
  { label: "토글", type: "toggle", aliases: ["toggle"] },
  { label: "콜아웃", type: "callout", aliases: ["callout"] },
  { label: "구분선", type: "divider", aliases: ["divider"] },
  { label: "표", type: "table", aliases: ["table"] },
  { label: "목차", type: "toc", aliases: ["table of contents", "toc"] },
  { label: "임베드", type: "embed", aliases: ["embed", "youtube", "google drive"] },
  { label: "북마크", type: "bookmark", aliases: ["bookmark", "link"] },
  { label: "이미지 삽입", type: "image", aliases: ["image"] },
  { label: "파일 첨부", type: "file", aliases: ["file", "pdf"] },
  { label: "페이지", type: "page_link", aliases: ["page", "새 페이지"] },
  { label: "컬럼 (2~5단)", type: "columns", aliases: ["columns", "column", "단 나누기"] },
  { label: "템플릿", type: "template", aliases: ["template"] },
  { label: "데이터베이스 - 테이블", type: "db_table", aliases: ["database", "table view"] },
  { label: "데이터베이스 - 보드", type: "db_board", aliases: ["board", "kanban"] },
  { label: "데이터베이스 - 갤러리", type: "db_gallery", aliases: ["gallery"] },
  { label: "데이터베이스 - 캘린더", type: "db_calendar", aliases: ["calendar"] },
  { label: "데이터베이스 - 리스트", type: "db_list", aliases: ["list"] },
];

function filterCommands(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.includes(q)));
}

function headingLevel(type: PageBlock["type"]): 1 | 2 | 3 | null {
  if (type === "heading1") return 1;
  if (type === "heading2") return 2;
  if (type === "heading3") return 3;
  return null;
}

export function Editor({
  pageId,
  content,
  attachments,
  editable,
  onChange,
  onOpenPage,
  onPagesChanged,
  pages,
  members,
}: {
  pageId: string;
  content: PageContent;
  attachments: AttachmentDTO[];
  editable: boolean;
  onChange: (next: PageContent) => void;
  onOpenPage: (pageId: string) => void;
  onPagesChanged: () => void;
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"image" | "file" | "template" | null>(null);
  const [templateTargetId, setTemplateTargetId] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; query: string; highlighted: number } | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]));

  const headings: HeadingRef[] = content.blocks
    .map((b) => {
      const level = headingLevel(b.type);
      return level && "text" in b ? { id: b.id, text: b.text, level } : null;
    })
    .filter((h): h is HeadingRef => h !== null);

  const setBlocks = useCallback(
    (blocks: PageBlock[]) => onChange({ blocks }),
    [onChange],
  );

  const updateBlock = (id: string, patch: Partial<PageBlock>) => {
    setBlocks(content.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as PageBlock) : b)));
  };

  const insertBlock = (afterId: string | null, type: PageBlock["type"]) => {
    const block = emptyBlockOfType(type);
    const blocks = [...content.blocks];
    if (afterId) {
      const idx = blocks.findIndex((b) => b.id === afterId);
      blocks.splice(idx + 1, 0, block);
    } else {
      blocks.push(block);
    }
    setBlocks(blocks);
    setActiveId(block.id);
    requestAnimationFrame(() => refs.current.get(block.id)?.focus());
  };

  const insertReferenceBlock = (type: "image" | "file", attachment: AttachmentDTO) => {
    const block: PageBlock = type === "image" ? { id: newBlockId(), type: "image", attachmentId: attachment.id } : { id: newBlockId(), type: "file", attachmentId: attachment.id };
    const blocks = [...content.blocks];
    if (activeId) {
      const idx = blocks.findIndex((b) => b.id === activeId);
      blocks.splice(idx + 1, 0, block);
    } else {
      blocks.push(block);
    }
    setBlocks(blocks);
    setPicker(null);
  };

  const removeBlock = (id: string) => {
    setBlocks(content.blocks.filter((b) => b.id !== id));
  };

  const applyInlineWrap = (marker: string) => {
    const id = activeId;
    if (!id) return;
    const el = refs.current.get(id);
    const block = content.blocks.find((b) => b.id === id);
    if (!el || !block || !("text" in block)) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const text = block.text;
    const next = `${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`;
    updateBlock(id, { text: next } as Partial<PageBlock>);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, end + marker.length);
    });
  };

  const applyLink = () => {
    const id = activeId;
    if (!id) return;
    const url = prompt("링크 URL을 입력하세요 (https://...)");
    if (!url) return;
    const el = refs.current.get(id);
    const block = content.blocks.find((b) => b.id === id);
    if (el && block && "text" in block) {
      const start = el.selectionStart ?? block.text.length;
      const end = el.selectionEnd ?? block.text.length;
      const label = block.text.slice(start, end) || "링크";
      const next = `${block.text.slice(0, start)}[${label}](${url})${block.text.slice(end)}`;
      updateBlock(id, { text: next } as Partial<PageBlock>);
    }
  };

  const applyTemplate = (key: TemplateKey) => {
    setPicker(null);
    const targetId = templateTargetId;
    setTemplateTargetId(null);
    if (!targetId) return;
    const idx = content.blocks.findIndex((b) => b.id === targetId);
    if (idx === -1) return;
    const newBlocks = buildTemplateBlocks(key);
    const blocks = [...content.blocks];
    blocks.splice(idx, 1, ...newBlocks);
    setBlocks(blocks);
    setActiveId(newBlocks[0].id);
    requestAnimationFrame(() => refs.current.get(newBlocks[0].id)?.focus());
  };

  const runSlashCommand = (block: PageBlock, cmd: { label: string; type: SlashCommandType }) => {
    setSlashMenu(null);

    if (cmd.type === "image" || cmd.type === "file") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      setActiveId(block.id);
      setPicker(cmd.type);
      return;
    }

    if (cmd.type === "template") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      setTemplateTargetId(block.id);
      setPicker("template");
      return;
    }

    if (cmd.type === "page_link") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      api.createPage({ parentId: pageId }).then((newPage) => {
        updateBlock(block.id, { type: "page_link", pageId: newPage.id } as Partial<PageBlock>);
        onPagesChanged();
      });
      return;
    }

    if (cmd.type === "columns") {
      updateBlock(block.id, { type: "columns", columns: ["", ""] } as Partial<PageBlock>);
      return;
    }

    const dbView = DB_VIEW_BY_COMMAND[cmd.type];
    if (dbView) {
      updateBlock(block.id, { type: "database_view", view: dbView } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "embed" || cmd.type === "bookmark") {
      const url = prompt(cmd.type === "embed" ? "임베드할 URL을 입력하세요 (YouTube, Google Drive 미리보기 링크 등)" : "북마크할 URL을 입력하세요 (https://...)");
      if (!url) {
        updateBlock(block.id, { text: "" } as Partial<PageBlock>);
        return;
      }
      updateBlock(block.id, { type: cmd.type, url } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "divider") {
      const idx = content.blocks.findIndex((b) => b.id === block.id);
      const dividerBlock: PageBlock = { id: block.id, type: "divider" };
      const nextParagraph = emptyBlockOfType("paragraph");
      const blocks = [...content.blocks];
      blocks[idx] = dividerBlock;
      blocks.splice(idx + 1, 0, nextParagraph);
      setBlocks(blocks);
      setActiveId(nextParagraph.id);
      requestAnimationFrame(() => refs.current.get(nextParagraph.id)?.focus());
      return;
    }

    if (cmd.type === "checklist_item") {
      updateBlock(block.id, { type: "checklist_item", text: "", checked: false } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "toggle") {
      updateBlock(block.id, { type: "toggle", text: "", body: "", expanded: true } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "callout") {
      updateBlock(block.id, { type: "callout", text: "" } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "table") {
      updateBlock(block.id, { type: "table", rows: [["", ""], ["", ""]] } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "toc") {
      updateBlock(block.id, { type: "toc" } as Partial<PageBlock>);
      return;
    }

    updateBlock(block.id, { type: cmd.type, text: "" } as Partial<PageBlock>);
    setActiveId(block.id);
    requestAnimationFrame(() => refs.current.get(block.id)?.focus());
  };

  const handleChangeText = (block: PageBlock, text: string) => {
    updateBlock(block.id, { text } as Partial<PageBlock>);
    if (text.startsWith("/")) {
      setSlashMenu({ blockId: block.id, query: text.slice(1), highlighted: 0 });
    } else if (slashMenu?.blockId === block.id) {
      setSlashMenu(null);
    }
  };

  const handleKeyDown = (block: PageBlock, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenu && slashMenu.blockId === block.id) {
      const filtered = filterCommands(slashMenu.query);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashMenu({ ...slashMenu, highlighted: filtered.length ? (slashMenu.highlighted + 1) % filtered.length : 0 });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashMenu({ ...slashMenu, highlighted: filtered.length ? (slashMenu.highlighted - 1 + filtered.length) % filtered.length : 0 });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[slashMenu.highlighted];
        if (cmd) runSlashCommand(block, cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenu(null);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      applyInlineWrap("**");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      applyInlineWrap("*");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      e.preventDefault();
      applyInlineWrap("__");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      applyLink();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const followType = block.type === "bulleted_list_item" || block.type === "numbered_list_item" || block.type === "checklist_item" ? block.type : "paragraph";
      insertBlock(block.id, followType);
      return;
    }
    if (e.key === "Backspace" && "text" in block && block.text === "" && content.blocks.length > 1) {
      e.preventDefault();
      const idx = content.blocks.findIndex((b) => b.id === block.id);
      removeBlock(block.id);
      const prev = content.blocks[idx - 1];
      if (prev) {
        setActiveId(prev.id);
        requestAnimationFrame(() => refs.current.get(prev.id)?.focus());
      }
    }
  };

  return (
    <div className="editor">
      {content.blocks.map((block, i) => (
        <div key={block.id}>
          <Block
            block={block}
            index={i}
            active={activeId === block.id}
            attachmentsById={attachmentsById}
            headings={headings}
            editable={editable}
            onFocus={() => setActiveId(block.id)}
            onChangeText={(text) => handleChangeText(block, text)}
            onToggleChecked={() => block.type === "checklist_item" && updateBlock(block.id, { checked: !block.checked })}
            onKeyDownBlock={(e) => handleKeyDown(block, e)}
            onRemoveBlock={() => removeBlock(block.id)}
            onPatch={(patch) => updateBlock(block.id, patch)}
            onOpenPage={onOpenPage}
            currentPageId={pageId}
            pages={pages}
            members={members}
            onPagesChanged={onPagesChanged}
            registerRef={(el) => {
              if (el) refs.current.set(block.id, el);
              else refs.current.delete(block.id);
            }}
          />

          {slashMenu?.blockId === block.id && (
            <div className="slash-menu">
              {filterCommands(slashMenu.query).length === 0 && <div className="slash-menu__empty">일치하는 명령어가 없습니다</div>}
              {filterCommands(slashMenu.query).map((cmd, ci) => (
                <button
                  key={cmd.label}
                  type="button"
                  className={`slash-menu__item${ci === slashMenu.highlighted ? " slash-menu__item--active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runSlashCommand(block, cmd);
                  }}
                  onMouseEnter={() => setSlashMenu({ ...slashMenu, highlighted: ci })}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {(picker === "image" || picker === "file") && (
        <AttachmentPicker
          pageId={pageId}
          filterImagesOnly={picker === "image"}
          onPick={(a) => insertReferenceBlock(picker, a)}
          onClose={() => setPicker(null)}
        />
      )}

      {picker === "template" && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <strong>템플릿 선택</strong>
              <button type="button" onClick={() => setPicker(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
                ✕
              </button>
            </div>
            <div className="modal__body" style={{ alignItems: "stretch", gap: 8 }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="template-picker__item"
                  onClick={() => applyTemplate(t.key)}
                >
                  <div className="template-picker__label">{t.label}</div>
                  <div className="template-picker__desc">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
