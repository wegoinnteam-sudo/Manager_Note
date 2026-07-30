import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AttachmentDTO, PageBlock, PageContent, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@shared/types";
import { Block, type HeadingRef } from "./Block";
import { caretPixelPosition, offsetAtEdgeLine } from "./caretPosition";
import { AttachmentPicker } from "./AttachmentPicker";
import { TEMPLATES, buildTemplateBlocks, type TemplateKey } from "./templates";
import { FORM_LIST, type FormKey } from "./forms";
import type { DatabaseViewType } from "./DatabaseView";
import { api, uploadAttachment } from "@/lib/api";
import type { PresenceUser } from "@/hooks/usePresence";

const MAX_UPLOAD_MB = Number((import.meta as any).env?.VITE_MAX_UPLOAD_MB ?? 50);
const INTERNAL_BLOCK_DRAG_TYPE = "application/x-team-note-block";

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

function newBlockId(): string {
  return crypto.randomUUID();
}

const TYPABLE_BLOCK_TYPES = new Set<PageBlock["type"]>([
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted_list_item",
  "numbered_list_item",
  "checklist_item",
]);

// File/image blocks aren't focusable text, so there's no "press Enter to add
// a line below" affordance on them. Insert an empty paragraph right after an
// upload (unless the next block already offers one) so there's always
// somewhere to click and type immediately below an attachment.
function withTrailingParagraph(blocks: PageBlock[], afterIndex: number): PageBlock[] {
  const next = blocks[afterIndex + 1];
  if (next && TYPABLE_BLOCK_TYPES.has(next.type)) return blocks;
  const copy = [...blocks];
  copy.splice(afterIndex + 1, 0, emptyBlockOfType("paragraph"));
  return copy;
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
      return { id, type, view: "table", groupBy: "status" };
    case "chart":
      return { id, type };
    case "button":
      return { id, type, label: "➕ 추가", templateKey: "meeting_notes" };
    case "form":
      return { id, type, formKey: "leave_request" };
    case "quote":
      return { id, type, text: "" };
    case "code":
      return { id, type, text: "", language: "plain" };
    case "equation":
      return { id, type, text: "" };
    case "secret":
      return { id, type, label: "" };
    case "breadcrumb":
      return { id, type };
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
  | "db_timeline"
  | "db_chart"
  | "db_list"
  | "chart"
  | "button"
  | "form"
  | "quote"
  | "code"
  | "equation"
  | "secret"
  | "insert_date"
  | "insert_reminder"
  | "duplicate"
  | "delete"
  | "breadcrumb"
  | "link_existing_page";

const DB_VIEW_BY_COMMAND: Partial<Record<SlashCommandType, DatabaseViewType>> = {
  db_table: "table",
  db_board: "board",
  db_gallery: "gallery",
  db_calendar: "calendar",
  db_timeline: "timeline",
  db_chart: "chart",
  db_list: "list",
};

const SLASH_COMMANDS: { label: string; type: SlashCommandType; aliases: string[] }[] = [
  { label: "텍스트", type: "paragraph", aliases: ["text", "plain"] },
  { label: "제목1", type: "heading1", aliases: ["heading 1", "h1"] },
  { label: "제목2", type: "heading2", aliases: ["heading 2", "h2"] },
  { label: "제목3", type: "heading3", aliases: ["heading 3", "h3"] },
  { label: "글머리표", type: "bulleted_list_item", aliases: ["bullet"] },
  { label: "번호 목록", type: "numbered_list_item", aliases: ["numbered", "num"] },
  { label: "체크리스트", type: "checklist_item", aliases: ["to-do", "todo"] },
  { label: "토글", type: "toggle", aliases: ["toggle"] },
  { label: "콜아웃", type: "callout", aliases: ["callout"] },
  { label: "인용문", type: "quote", aliases: ["quote"] },
  { label: "구분선", type: "divider", aliases: ["divider", "div"] },
  { label: "코드", type: "code", aliases: ["code"] },
  { label: "수식", type: "equation", aliases: ["equation", "math", "latex"] },
  { label: "민감정보", type: "secret", aliases: ["secret", "sensitive", "password", "비밀번호", "민감정보"] },
  { label: "오늘 날짜", type: "insert_date", aliases: ["date", "today", "날짜"] },
  { label: "알림 메모", type: "insert_reminder", aliases: ["reminder", "알림"] },
  { label: "표", type: "table", aliases: ["table"] },
  { label: "목차", type: "toc", aliases: ["table of contents", "toc"] },
  { label: "임베드", type: "embed", aliases: ["embed", "youtube", "google drive"] },
  { label: "북마크", type: "bookmark", aliases: ["bookmark", "link", "book", "web"] },
  { label: "이미지 삽입", type: "image", aliases: ["image"] },
  { label: "파일 첨부", type: "file", aliases: ["file", "pdf", "video", "audio", "동영상", "음성"] },
  { label: "페이지", type: "page_link", aliases: ["page", "새 페이지"] },
  { label: "기존 페이지 연결", type: "link_existing_page", aliases: ["link to page", "기존 페이지"] },
  { label: "컬럼 (2~5단)", type: "columns", aliases: ["columns", "column", "단 나누기"] },
  { label: "템플릿", type: "template", aliases: ["template"] },
  { label: "데이터베이스 - 테이블", type: "db_table", aliases: ["database", "table view"] },
  { label: "데이터베이스 - 보드", type: "db_board", aliases: ["board", "kanban"] },
  { label: "데이터베이스 - 갤러리", type: "db_gallery", aliases: ["gallery"] },
  { label: "데이터베이스 - 캘린더", type: "db_calendar", aliases: ["calendar"] },
  { label: "데이터베이스 - 타임라인", type: "db_timeline", aliases: ["timeline"] },
  { label: "데이터베이스 - 요약 차트", type: "db_chart", aliases: ["database chart", "db chart"] },
  { label: "데이터베이스 - 리스트", type: "db_list", aliases: ["list"] },
  { label: "차트", type: "chart", aliases: ["chart", "graph"] },
  { label: "버튼", type: "button", aliases: ["button"] },
  { label: "폼", type: "form", aliases: ["form"] },
  { label: "현재 위치", type: "breadcrumb", aliases: ["breadcrumb"] },
  { label: "현재 블록 복제", type: "duplicate", aliases: ["duplicate", "복제"] },
  { label: "현재 블록 삭제", type: "delete", aliases: ["delete", "삭제"] },
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

// Ctrl/Cmd+Shift+<digit> block-type shortcuts. Keyed by e.code so the
// mapping stays correct even when Shift changes what e.key reports for the
// number row (e.g. Shift+1 -> "!" on a US layout).
const BLOCK_TYPE_SHORTCUT: Record<string, PageBlock["type"]> = {
  Digit0: "paragraph",
  Digit1: "heading1",
  Digit2: "heading2",
  Digit3: "heading3",
  Digit4: "checklist_item",
  Digit5: "bulleted_list_item",
  Digit6: "numbered_list_item",
  Digit7: "toggle",
};

const MAX_BLOCK_INDENT = 8;

// Markdown-style auto-formatting: typing "# ", "- ", "1. ", "[] " or "> " at
// the start of a plain paragraph converts it to the matching block type,
// mirroring Notion's "입력만으로 만드는 빠른 블록" shortcuts.
function detectMarkdownAutoFormat(text: string): { type: PageBlock["type"]; rest: string; extra?: Record<string, unknown> } | null {
  let m = text.match(/^(#{1,3}) /);
  if (m) {
    const type = m[1].length === 1 ? "heading1" : m[1].length === 2 ? "heading2" : "heading3";
    return { type, rest: text.slice(m[0].length) };
  }
  if ((m = text.match(/^[-*] /))) {
    return { type: "bulleted_list_item", rest: text.slice(m[0].length) };
  }
  if ((m = text.match(/^\d+\. /))) {
    return { type: "numbered_list_item", rest: text.slice(m[0].length) };
  }
  if ((m = text.match(/^\[\] /))) {
    return { type: "checklist_item", rest: text.slice(m[0].length), extra: { checked: false } };
  }
  if ((m = text.match(/^> /))) {
    return { type: "quote", rest: text.slice(m[0].length) };
  }
  return null;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

type MentionEntry = { label: string; token: string };

function filterMentions(query: string, members: TeamMemberDTO[]): MentionEntry[] {
  const q = query.trim().toLowerCase();
  const dateEntries: MentionEntry[] = [
    { label: "오늘", token: `@[오늘](date:${isoDate(0)})` },
    { label: "내일", token: `@[내일](date:${isoDate(1)})` },
  ].filter((e) => !q || e.label.toLowerCase().includes(q));
  const memberEntries: MentionEntry[] = members
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .map((m) => ({ label: m.name, token: `@[${m.name}](user:${m.id})` }));
  return [...memberEntries, ...dateEntries];
}

export interface EditorHandle {
  focusFirstBlock: () => void;
}

export const Editor = forwardRef<EditorHandle, {
  pageId: string;
  content: PageContent;
  attachments: AttachmentDTO[];
  editable: boolean;
  onChange: (next: PageContent) => void;
  onOpenPage: (pageId: string) => void;
  onPagesChanged: () => void;
  onAttachmentUploaded: (attachment: AttachmentDTO) => void;
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
  registerFileDropHandler: (handler: (files: FileList) => void) => void;
  presenceUsers: PresenceUser[];
  onCursorReport: (blockId: string | null, offset: number) => void;
  canViewSensitive: boolean;
}>(function Editor(
  { pageId, content, attachments, editable, onChange, onOpenPage, onPagesChanged, onAttachmentUploaded, pages, members, registerFileDropHandler, presenceUsers, onCursorReport, canViewSensitive },
  ref,
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<"image" | "file" | "template" | "button_template" | "form" | "page_picker" | "replace_image" | null>(null);
  const [templateTargetId, setTemplateTargetId] = useState<string | null>(null);
  const [imageReplaceTargetId, setImageReplaceTargetId] = useState<string | null>(null);
  const [pagePickerQuery, setPagePickerQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    id: string;
    position: "before" | "after";
    align: "left" | "center" | "right";
  } | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; query: string; highlighted: number } | null>(null);
  const [mentionMenu, setMentionMenu] = useState<{ blockId: string; query: string; highlighted: number; triggerStart: number } | null>(null);
  const [pendingUploads, setPendingUploads] = useState<{ id: string; previewUrl: string; afterId: string | null }[]>([]);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]));
  const contentRef = useRef(content);
  contentRef.current = content;

  useImperativeHandle(ref, () => ({
    focusFirstBlock: () => {
      const first = content.blocks[0];
      if (!first) return;
      setActiveId(first.id);
      requestAnimationFrame(() => refs.current.get(first.id)?.focus());
    },
  }));

  const headings: HeadingRef[] = content.blocks
    .map((b) => {
      const level = headingLevel(b.type);
      return level && "text" in b ? { id: b.id, text: b.text, level } : null;
    })
    .filter((h): h is HeadingRef => h !== null);

  const remoteCursorsByBlock = new Map<string, PresenceUser[]>();
  for (const u of presenceUsers) {
    if (!u.blockId) continue;
    const list = remoteCursorsByBlock.get(u.blockId) ?? [];
    list.push(u);
    remoteCursorsByBlock.set(u.blockId, list);
  }

  const setBlocks = useCallback(
    (blocks: PageBlock[]) => onChange({ blocks }),
    [onChange],
  );

  const droppedFilesHandlerRef = useRef<(files: FileList) => void>(() => {});

  const handleDroppedFiles = (files: FileList) => {
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const ext = extensionOf(file.name);
      if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
        alert(`허용되지 않은 파일 형식입니다: .${ext || "?"} (${file.name})`);
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        alert(`파일 크기는 ${MAX_UPLOAD_MB}MB를 초과할 수 없습니다: ${file.name}`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    const afterId = activeId;
    const pending = valid.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" }));
    setPendingUploads((prev) => [...prev, ...pending.filter((p) => p.previewUrl).map(({ id, previewUrl }) => ({ id, previewUrl, afterId }))]);

    Promise.allSettled(pending.map((p) => uploadAttachment(pageId, p.file, { idempotencyKey: p.id }))).then((results) => {
      setPendingUploads((prev) => prev.filter((p) => !pending.some((done) => done.id === p.id)));
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));

      const failedNames = results
        .map((r, i) => (r.status === "rejected" ? { file: pending[i].file.name, reason: r.reason } : null))
        .filter((f): f is { file: string; reason: unknown } => f !== null);
      if (failedNames.length > 0) {
        console.error("업로드 실패:", failedNames);
        alert(failedNames.map((f) => `${f.file}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`).join("\n"));
      }

      const uploaded = results.filter((r): r is PromiseFulfilledResult<AttachmentDTO> => r.status === "fulfilled").map((r) => r.value);
      if (uploaded.length === 0) return;
      uploaded.forEach((a) => onAttachmentUploaded(a));
      const newBlocks: PageBlock[] = uploaded.map((a) =>
        a.isImage ? { id: newBlockId(), type: "image", attachmentId: a.id } : { id: newBlockId(), type: "file", attachmentId: a.id },
      );
      let blocks = [...contentRef.current.blocks];
      let insertAt: number;
      if (afterId) {
        const idx = blocks.findIndex((b) => b.id === afterId);
        insertAt = idx === -1 ? blocks.length : idx + 1;
        blocks.splice(insertAt, 0, ...newBlocks);
      } else {
        insertAt = blocks.length;
        blocks.push(...newBlocks);
      }
      blocks = withTrailingParagraph(blocks, insertAt + newBlocks.length - 1);
      setBlocks(blocks);
    });
  };

  droppedFilesHandlerRef.current = handleDroppedFiles;

  useEffect(() => {
    registerFileDropHandler((files) => droppedFilesHandlerRef.current(files));
  }, [registerFileDropHandler]);

  // Click-and-drag anywhere in the editor background (not on a textarea,
  // button, link, etc.) draws a selection rectangle; any block it overlaps
  // gets added to selectedBlockIds, same set used by Ctrl+A/Escape select.
  const startMarqueeSelect = (e: React.MouseEvent) => {
    if (!editable || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, button, a, select, [contenteditable]")) return;
    setSelectedBlockIds(new Set());
    setMarquee({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!marquee) return;
    const onMove = (e: MouseEvent) => {
      setMarquee((current) => (current ? { ...current, x: e.clientX, y: e.clientY } : current));
    };
    const onUp = (e: MouseEvent) => {
      const left = Math.min(marquee.startX, e.clientX);
      const right = Math.max(marquee.startX, e.clientX);
      const top = Math.min(marquee.startY, e.clientY);
      const bottom = Math.max(marquee.startY, e.clientY);
      const moved = right - left > 4 || bottom - top > 4;
      if (moved && editorRef.current) {
        const hits = new Set<string>();
        editorRef.current.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
            hits.add(el.dataset.blockId!);
          }
        });
        setSelectedBlockIds(hits);
      }
      setMarquee(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [marquee]);

  // Delete/Backspace for a mouse-drawn selection: no textarea is focused in
  // that case, so handleKeyDown's per-block onKeyDownBlock never fires —
  // handle it globally instead, but stay out of the way while typing.
  useEffect(() => {
    if (selectedBlockIds.size === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setBlocks(content.blocks.filter((b) => !selectedBlockIds.has(b.id)));
        setSelectedBlockIds(new Set());
      } else if (e.key === "Escape") {
        setSelectedBlockIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedBlockIds, content.blocks, setBlocks]);

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

  const insertReferenceBlocks = (type: "image" | "file", newAttachments: AttachmentDTO[]) => {
    newAttachments.forEach((a) => onAttachmentUploaded(a));
    const newBlocks: PageBlock[] = newAttachments.map((a) =>
      type === "image" ? { id: newBlockId(), type: "image", attachmentId: a.id } : { id: newBlockId(), type: "file", attachmentId: a.id },
    );
    let blocks = [...content.blocks];
    let insertAt: number;
    if (activeId) {
      const idx = blocks.findIndex((b) => b.id === activeId);
      insertAt = idx + 1;
      blocks.splice(insertAt, 0, ...newBlocks);
    } else {
      insertAt = blocks.length;
      blocks.push(...newBlocks);
    }
    blocks = withTrailingParagraph(blocks, insertAt + newBlocks.length - 1);
    setBlocks(blocks);
    setPicker(null);
  };

  const insertImageUrlBlock = (url: string) => {
    const newBlock: PageBlock = { id: newBlockId(), type: "image", url };
    const blocks = [...content.blocks];
    if (activeId) {
      const idx = blocks.findIndex((b) => b.id === activeId);
      blocks.splice(idx + 1, 0, newBlock);
    } else {
      blocks.push(newBlock);
    }
    setBlocks(blocks);
    setPicker(null);
  };

  const openImageReplacePicker = (blockId: string) => {
    setImageReplaceTargetId(blockId);
    setPicker("replace_image");
  };

  const applyImageReplace = (newAttachments: AttachmentDTO[]) => {
    setPicker(null);
    const targetId = imageReplaceTargetId;
    setImageReplaceTargetId(null);
    const attachment = newAttachments[0];
    if (!targetId || !attachment) return;
    onAttachmentUploaded(attachment);
    updateBlock(targetId, { attachmentId: attachment.id, url: undefined } as Partial<PageBlock>);
  };

  const handlePasteImage = async (block: PageBlock, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();

    const pendingId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setPendingUploads((prev) => [...prev, { id: pendingId, previewUrl, afterId: block.id }]);

    try {
      const attachment = await uploadAttachment(pageId, file, { idempotencyKey: pendingId });
      onAttachmentUploaded(attachment);
      const idx = contentRef.current.blocks.findIndex((b) => b.id === block.id);
      const newBlock: PageBlock = { id: newBlockId(), type: "image", attachmentId: attachment.id };
      const blocks = [...contentRef.current.blocks];
      blocks.splice(idx === -1 ? blocks.length : idx + 1, 0, newBlock);
      setBlocks(blocks);
    } catch (err) {
      console.error("붙여넣기 업로드 실패:", err);
      alert(`이미지 붙여넣기에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPendingUploads((prev) => prev.filter((p) => p.id !== pendingId));
      URL.revokeObjectURL(previewUrl);
    }
  };

  const moveBlock = (
    draggedBlockId: string,
    targetBlockId: string,
    position: "before" | "after",
    align: "left" | "center" | "right",
  ) => {
    const blocks = [...content.blocks];
    const fromIdx = blocks.findIndex((b) => b.id === draggedBlockId);
    if (fromIdx === -1) return;
    if (draggedBlockId === targetBlockId) {
      const current = blocks[fromIdx];
      if (current.type === "image") blocks[fromIdx] = { ...current, align };
      setBlocks(blocks);
      return;
    }
    const [moved] = blocks.splice(fromIdx, 1);
    const targetIdx = blocks.findIndex((b) => b.id === targetBlockId);
    if (targetIdx === -1) return;
    const positioned = moved.type === "image" ? { ...moved, align } : moved;
    blocks.splice(position === "after" ? targetIdx + 1 : targetIdx, 0, positioned);
    setBlocks(blocks);
  };

  const removeBlock = (id: string) => {
    setBlocks(content.blocks.filter((b) => b.id !== id));
  };

  const duplicateBlock = (id: string) => {
    const idx = content.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const clone: PageBlock = { ...content.blocks[idx], id: newBlockId() };
    const blocks = [...content.blocks];
    blocks.splice(idx + 1, 0, clone);
    setBlocks(blocks);
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

  const applyButtonTemplate = (key: TemplateKey) => {
    setPicker(null);
    const targetId = templateTargetId;
    setTemplateTargetId(null);
    if (!targetId) return;
    const label = `➕ ${TEMPLATES.find((t) => t.key === key)?.label ?? "추가"}`;
    updateBlock(targetId, { type: "button", label, templateKey: key } as Partial<PageBlock>);
  };

  const applyForm = (key: FormKey) => {
    setPicker(null);
    const targetId = templateTargetId;
    setTemplateTargetId(null);
    if (!targetId) return;
    updateBlock(targetId, { type: "form", formKey: key } as Partial<PageBlock>);
  };

  const applyExistingPageLink = (targetPageId: string) => {
    setPicker(null);
    setPagePickerQuery("");
    const targetId = templateTargetId;
    setTemplateTargetId(null);
    if (!targetId) return;
    updateBlock(targetId, { type: "page_link", pageId: targetPageId } as Partial<PageBlock>);
  };

  const insertMention = (block: PageBlock, entry: MentionEntry) => {
    if (!mentionMenu || !("text" in block)) return;
    const el = refs.current.get(block.id);
    const caret = el?.selectionStart ?? block.text.length;
    const before = block.text.slice(0, mentionMenu.triggerStart);
    const after = block.text.slice(caret);
    const inserted = `${entry.token} `;
    const next = `${before}${inserted}${after}`;
    updateBlock(block.id, { text: next } as Partial<PageBlock>);
    setMentionMenu(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const insertTemplateAfter = (afterId: string, key: TemplateKey) => {
    const idx = content.blocks.findIndex((b) => b.id === afterId);
    if (idx === -1) return;
    const newBlocks = buildTemplateBlocks(key);
    const blocks = [...content.blocks];
    blocks.splice(idx + 1, 0, ...newBlocks);
    setBlocks(blocks);
  };

  const runSlashCommand = (block: PageBlock, cmd: { label: string; type: SlashCommandType }) => {
    setSlashMenu(null);

    if (cmd.type === "duplicate") {
      duplicateBlock(block.id);
      return;
    }

    if (cmd.type === "delete") {
      removeBlock(block.id);
      return;
    }

    if (cmd.type === "insert_date") {
      const today = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date());
      updateBlock(block.id, { type: "paragraph", text: today } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "insert_reminder") {
      const when = prompt("알림 날짜와 시간을 입력하세요. (예: 2026-08-01 09:00)");
      if (!when?.trim()) {
        updateBlock(block.id, { type: "paragraph", text: "" } as Partial<PageBlock>);
        return;
      }
      updateBlock(block.id, { type: "callout", text: `⏰ ${when.trim()} — ` } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

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

    if (cmd.type === "button") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      setTemplateTargetId(block.id);
      setPicker("button_template");
      return;
    }

    if (cmd.type === "form") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      setTemplateTargetId(block.id);
      setPicker("form");
      return;
    }

    if (cmd.type === "chart") {
      updateBlock(block.id, { type: "chart" } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "quote") {
      updateBlock(block.id, { type: "quote", text: "" } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "code") {
      updateBlock(block.id, { type: "code", text: "", language: "plain" } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "equation") {
      updateBlock(block.id, { type: "equation", text: "" } as Partial<PageBlock>);
      setActiveId(block.id);
      requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      return;
    }

    if (cmd.type === "secret") {
      updateBlock(block.id, { type: "secret", label: "" } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "breadcrumb") {
      updateBlock(block.id, { type: "breadcrumb" } as Partial<PageBlock>);
      return;
    }

    if (cmd.type === "link_existing_page") {
      updateBlock(block.id, { text: "" } as Partial<PageBlock>);
      setTemplateTargetId(block.id);
      setPagePickerQuery("");
      setPicker("page_picker");
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
      updateBlock(block.id, { type: "database_view", view: dbView, groupBy: "status" } as Partial<PageBlock>);
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

  const handleChangeText = (block: PageBlock, text: string, caret: number) => {
    if (block.type === "paragraph") {
      if (text === "---") {
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
      const auto = detectMarkdownAutoFormat(text);
      if (auto) {
        updateBlock(block.id, { type: auto.type, text: auto.rest, ...(auto.extra ?? {}) } as Partial<PageBlock>);
        onCursorReport(block.id, auto.rest.length);
        requestAnimationFrame(() => {
          const el = refs.current.get(block.id);
          el?.setSelectionRange(auto.rest.length, auto.rest.length);
        });
        return;
      }
    }

    updateBlock(block.id, { text } as Partial<PageBlock>);
    onCursorReport(block.id, caret);

    if (text.startsWith("/")) {
      setSlashMenu({ blockId: block.id, query: text.slice(1), highlighted: 0 });
    } else if (slashMenu?.blockId === block.id) {
      setSlashMenu(null);
    }

    const uptoCaret = text.slice(0, caret);
    const atMatch = uptoCaret.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionMenu({ blockId: block.id, query: atMatch[1], highlighted: 0, triggerStart: caret - atMatch[0].length });
    } else if (mentionMenu?.blockId === block.id) {
      setMentionMenu(null);
    }
  };

  const handleKeyDown = (block: PageBlock, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu && mentionMenu.blockId === block.id) {
      const filtered = filterMentions(mentionMenu.query, members);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionMenu({ ...mentionMenu, highlighted: filtered.length ? (mentionMenu.highlighted + 1) % filtered.length : 0 });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionMenu({ ...mentionMenu, highlighted: filtered.length ? (mentionMenu.highlighted - 1 + filtered.length) % filtered.length : 0 });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const entry = filtered[mentionMenu.highlighted];
        if (entry) insertMention(block, entry);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionMenu(null);
        return;
      }
    }

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

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelectedBlockIds(new Set(content.blocks.map((candidate) => candidate.id)));
      setSlashMenu(null);
      setMentionMenu(null);
      return;
    }

    if (selectedBlockIds.has(block.id)) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedBlockIds(new Set());
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setBlocks(content.blocks.filter((candidate) => !selectedBlockIds.has(candidate.id)));
        setSelectedBlockIds(new Set());
        setActiveId(null);
        onCursorReport(null, 0);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = content.blocks.findIndex((b) => b.id === block.id);
        const target = content.blocks[idx + (e.key === "ArrowUp" ? -1 : 1)];
        if (target) setSelectedBlockIds(new Set([target.id]));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setSelectedBlockIds(new Set());
        return;
      }
      setSelectedBlockIds(new Set());
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedBlockIds(new Set([block.id]));
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const idx = content.blocks.findIndex((b) => b.id === block.id);
      const targetIdx = idx + (e.key === "ArrowUp" ? -1 : 1);
      if (targetIdx >= 0 && targetIdx < content.blocks.length) {
        const blocks = [...content.blocks];
        [blocks[idx], blocks[targetIdx]] = [blocks[targetIdx], blocks[idx]];
        setBlocks(blocks);
        requestAnimationFrame(() => refs.current.get(block.id)?.focus());
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const current = block.indent ?? 0;
      if (e.shiftKey) {
        if (current > 0) updateBlock(block.id, { indent: current - 1 } as Partial<PageBlock>);
      } else if (current < MAX_BLOCK_INDENT) {
        updateBlock(block.id, { indent: current + 1 } as Partial<PageBlock>);
      }
      return;
    }

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && "text" in block && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const textarea = e.currentTarget;
      const caret = textarea.selectionStart ?? 0;
      const text = textarea.value;
      const currentTop = caretPixelPosition(textarea, caret).top;
      const currentLeft = caretPixelPosition(textarea, caret).left;
      const isCollapsed = textarea.selectionStart === textarea.selectionEnd;

      const isOnLastLine = caret === text.length || currentTop === caretPixelPosition(textarea, text.length).top;
      if (e.key === "ArrowDown" && isCollapsed && isOnLastLine) {
        const idx = content.blocks.findIndex((b) => b.id === block.id);
        const next = content.blocks.slice(idx + 1).find((b) => "text" in b);
        if (next && "text" in next) {
          e.preventDefault();
          setActiveId(next.id);
          requestAnimationFrame(() => {
            const el = refs.current.get(next.id);
            if (!el) return;
            el.focus();
            const offset = offsetAtEdgeLine(el, next.text, currentLeft, "first");
            el.setSelectionRange(offset, offset);
          });
          return;
        }
      }

      const isOnFirstLine = caret === 0 || currentTop === caretPixelPosition(textarea, 0).top;
      if (e.key === "ArrowUp" && isCollapsed && isOnFirstLine) {
        const idx = content.blocks.findIndex((b) => b.id === block.id);
        const prev = [...content.blocks.slice(0, idx)].reverse().find((b) => "text" in b);
        if (prev && "text" in prev) {
          e.preventDefault();
          setActiveId(prev.id);
          requestAnimationFrame(() => {
            const el = refs.current.get(prev.id);
            if (!el) return;
            el.focus();
            const offset = offsetAtEdgeLine(el, prev.text, currentLeft, "last");
            el.setSelectionRange(offset, offset);
          });
          return;
        }
      }

      // Let the browser perform its normal in-textarea line movement first.
      // If the caret did not move, it was already at the visual edge even
      // when mirror-based pixel measurement disagreed (which can happen with
      // browser font metrics and wrapping). Continue into the adjacent block.
      if (isCollapsed) {
        const direction = e.key === "ArrowDown" ? 1 : -1;
        requestAnimationFrame(() => {
          if (
            document.activeElement !== textarea ||
            textarea.selectionStart !== caret ||
            textarea.selectionEnd !== caret
          ) {
            return;
          }

          const idx = content.blocks.findIndex((b) => b.id === block.id);
          const candidates =
            direction === 1
              ? content.blocks.slice(idx + 1)
              : [...content.blocks.slice(0, idx)].reverse();
          const adjacent = candidates.find((b) => "text" in b);
          if (!adjacent || !("text" in adjacent)) return;

          setActiveId(adjacent.id);
          requestAnimationFrame(() => {
            const el = refs.current.get(adjacent.id);
            if (!el) return;
            el.focus();
            const offset = offsetAtEdgeLine(
              el,
              adjacent.text,
              currentLeft,
              direction === 1 ? "first" : "last",
            );
            el.setSelectionRange(offset, offset);
            onCursorReport(adjacent.id, offset);
          });
        });
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
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      applyInlineWrap("~");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      applyInlineWrap("`");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateBlock(block.id);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && BLOCK_TYPE_SHORTCUT[e.code] && "text" in block) {
      e.preventDefault();
      const type = BLOCK_TYPE_SHORTCUT[e.code];
      if (type === "checklist_item") {
        updateBlock(block.id, { type, text: block.text, checked: false } as Partial<PageBlock>);
      } else if (type === "toggle") {
        updateBlock(block.id, { type, text: block.text, body: "", expanded: true } as Partial<PageBlock>);
      } else {
        updateBlock(block.id, { type, text: block.text } as Partial<PageBlock>);
      }
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
    <div className="editor" ref={editorRef} onMouseDown={startMarqueeSelect}>
      {marquee && (
        <div
          className="editor__marquee"
          style={{
            left: Math.min(marquee.startX, marquee.x) - (editorRef.current?.getBoundingClientRect().left ?? 0),
            top: Math.min(marquee.startY, marquee.y) - (editorRef.current?.getBoundingClientRect().top ?? 0),
            width: Math.abs(marquee.x - marquee.startX),
            height: Math.abs(marquee.y - marquee.startY),
          }}
        />
      )}
      {content.blocks.map((block, i) => (
        <div
          key={block.id}
          onSelectCapture={(event) => {
            const target = event.target;
            if (target instanceof HTMLTextAreaElement) {
              onCursorReport(block.id, target.selectionStart ?? 0);
            }
          }}
        >
          <div
            data-block-id={block.id}
            className={[
              "block-wrapper",
              block.type === "image" && editable ? "block-wrapper--image-movable" : "",
              block.type === "file" && editable ? "block-wrapper--file-movable" : "",
              draggedId === block.id ? "block-wrapper--dragging" : "",
              dragTarget?.id === block.id ? `block-wrapper--drop-${dragTarget.position}` : "",
              dragTarget?.id === block.id ? `block-wrapper--align-${dragTarget.align}` : "",
              selectedBlockIds.has(block.id) ? "block-wrapper--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={block.indent ? { marginLeft: block.indent * 24 } : undefined}
            draggable={editable && (block.type === "image" || block.type === "file")}
            onDragStart={(e) => {
              if (!editable || (block.type !== "image" && block.type !== "file")) return;
              const target = e.target as HTMLElement;
              if (
                target.closest("button, input, .image-block__handle") ||
                (block.type === "image" && target.closest("a"))
              ) {
                e.preventDefault();
                return;
              }
              // A file name/preview is normally draggable as a browser URL.
              // Remove that native payload so an uploaded attachment can only
              // move its existing block inside the editor.
              e.dataTransfer.clearData();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", block.id);
              e.dataTransfer.setData(INTERNAL_BLOCK_DRAG_TYPE, block.id);
              setDraggedId(block.id);
            }}
            onDragOver={(e) => {
              if (!editable || !draggedId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
              const horizontalRatio = (e.clientX - rect.left) / rect.width;
              const align = horizontalRatio < 1 / 3 ? "left" : horizontalRatio > 2 / 3 ? "right" : "center";
              setDragTarget({ id: block.id, position, align });
            }}
            onDrop={(e) => {
              if (!editable || !draggedId) return;
              e.preventDefault();
              const position = dragTarget?.id === block.id ? dragTarget.position : "before";
              const align = dragTarget?.id === block.id ? dragTarget.align : "left";
              moveBlock(draggedId, block.id, position, align);
              setDraggedId(null);
              setDragTarget(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragTarget(null);
            }}
          >
            {editable && (
              <span
                className="block-drag-handle"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.clearData();
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", block.id);
                  e.dataTransfer.setData(INTERNAL_BLOCK_DRAG_TYPE, block.id);
                  setDraggedId(block.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragTarget(null);
                }}
                title="드래그해서 순서 변경"
              >
                ⋮⋮
              </span>
            )}
            <div className="block-wrapper__content">
              <Block
                block={block}
                index={i}
                active={activeId === block.id}
                attachmentsById={attachmentsById}
                headings={headings}
                editable={editable}
                onFocus={() => {
                  setActiveId(block.id);
                  setSelectedBlockIds(new Set());
                  onCursorReport(block.id, refs.current.get(block.id)?.selectionStart ?? 0);
                }}
                onChangeText={(text, caret) => handleChangeText(block, text, caret)}
                onToggleChecked={() => block.type === "checklist_item" && updateBlock(block.id, { checked: !block.checked })}
                onKeyDownBlock={(e) => handleKeyDown(block, e)}
                onPasteBlock={(e) => handlePasteImage(block, e)}
                onRemoveBlock={() => removeBlock(block.id)}
                onDuplicateBlock={() => duplicateBlock(block.id)}
                onPatch={(patch) => updateBlock(block.id, patch)}
                onOpenPage={onOpenPage}
                currentPageId={pageId}
                pages={pages}
                members={members}
                onPagesChanged={onPagesChanged}
                onInsertTemplateAfter={insertTemplateAfter}
                onReplaceImage={openImageReplacePicker}
                remoteCursors={remoteCursorsByBlock.get(block.id) ?? []}
                registerRef={(el) => {
                  if (el) refs.current.set(block.id, el);
                  else refs.current.delete(block.id);
                }}
                canViewSensitive={canViewSensitive}
              />
            </div>
          </div>

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

          {mentionMenu?.blockId === block.id && (
            <div className="slash-menu">
              {filterMentions(mentionMenu.query, members).length === 0 && <div className="slash-menu__empty">일치하는 항목이 없습니다</div>}
              {filterMentions(mentionMenu.query, members).map((entry, ci) => (
                <button
                  key={entry.label}
                  type="button"
                  className={`slash-menu__item${ci === mentionMenu.highlighted ? " slash-menu__item--active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(block, entry);
                  }}
                  onMouseEnter={() => setMentionMenu({ ...mentionMenu, highlighted: ci })}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}

          {pendingUploads
            .filter((p) => p.afterId === block.id)
            .map((p) => (
              <div key={p.id} className="block-row">
                <div className="pending-upload">
                  <img src={p.previewUrl} alt="" />
                  <span className="pending-upload__badge">업로드 중…</span>
                </div>
              </div>
            ))}
        </div>
      ))}

      {pendingUploads
        .filter((p) => p.afterId === null)
        .map((p) => (
          <div key={p.id} className="block-row">
            <div className="pending-upload">
              <img src={p.previewUrl} alt="" />
              <span className="pending-upload__badge">업로드 중…</span>
            </div>
          </div>
        ))}

      {(picker === "image" || picker === "file") && (
        <AttachmentPicker
          pageId={pageId}
          filterImagesOnly={picker === "image"}
          onPick={(atts) => insertReferenceBlocks(picker, atts)}
          onPickUrl={picker === "image" ? insertImageUrlBlock : undefined}
          onClose={() => setPicker(null)}
        />
      )}

      {picker === "replace_image" && (
        <AttachmentPicker pageId={pageId} filterImagesOnly onPick={applyImageReplace} onClose={() => setPicker(null)} />
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

      {picker === "button_template" && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <strong>버튼을 누르면 삽입할 템플릿</strong>
              <button type="button" onClick={() => setPicker(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
                ✕
              </button>
            </div>
            <div className="modal__body" style={{ alignItems: "stretch", gap: 8 }}>
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" className="template-picker__item" onClick={() => applyButtonTemplate(t.key)}>
                  <div className="template-picker__label">{t.label}</div>
                  <div className="template-picker__desc">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {picker === "form" && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <strong>폼 선택</strong>
              <button type="button" onClick={() => setPicker(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
                ✕
              </button>
            </div>
            <div className="modal__body" style={{ alignItems: "stretch", gap: 8 }}>
              {FORM_LIST.map((f) => (
                <button key={f.key} type="button" className="template-picker__item" onClick={() => applyForm(f.key)}>
                  <div className="template-picker__label">{f.label}</div>
                  <div className="template-picker__desc">{f.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {picker === "page_picker" && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <strong>연결할 페이지 선택</strong>
              <button type="button" onClick={() => setPicker(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "10px 16px 0" }}>
              <input
                autoFocus
                type="text"
                placeholder="페이지 제목 검색…"
                value={pagePickerQuery}
                onChange={(e) => setPagePickerQuery(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div className="modal__body" style={{ alignItems: "stretch", gap: 4, maxHeight: 320 }}>
              {pages
                .filter((p) => !p.isDeleted && p.id !== pageId && p.title.toLowerCase().includes(pagePickerQuery.trim().toLowerCase()))
                .slice(0, 50)
                .map((p) => (
                  <button key={p.id} type="button" className="template-picker__item" onClick={() => applyExistingPageLink(p.id)}>
                    <div className="template-picker__label">{p.title}</div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
