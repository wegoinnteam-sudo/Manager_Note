import { useCallback, useRef, useState } from "react";
import type { AttachmentDTO, PageBlock, PageContent } from "@shared/types";
import { Block } from "./Block";
import { AttachmentPicker } from "./AttachmentPicker";

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
    default:
      return { id, type: type as any, text: "" };
  }
}

export function Editor({
  pageId,
  content,
  attachments,
  editable,
  onChange,
}: {
  pageId: string;
  content: PageContent;
  attachments: AttachmentDTO[];
  editable: boolean;
  onChange: (next: PageContent) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"image" | "file" | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]));

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

  const handleKeyDown = (block: PageBlock, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        <Block
          key={block.id}
          block={block}
          index={i}
          active={activeId === block.id}
          attachmentsById={attachmentsById}
          editable={editable}
          onFocus={() => setActiveId(block.id)}
          onChangeText={(text) => updateBlock(block.id, { text } as Partial<PageBlock>)}
          onToggleChecked={() => block.type === "checklist_item" && updateBlock(block.id, { checked: !block.checked })}
          onKeyDownBlock={(e) => handleKeyDown(block, e)}
          onRemoveImage={() => removeBlock(block.id)}
          registerRef={(el) => {
            if (el) refs.current.set(block.id, el);
            else refs.current.delete(block.id);
          }}
        />
      ))}

      {editable && (
        <div className="block-toolbar">
          <button type="button" onClick={() => insertBlock(activeId, "paragraph")}>텍스트</button>
          <button type="button" onClick={() => insertBlock(activeId, "heading1")}>제목1</button>
          <button type="button" onClick={() => insertBlock(activeId, "heading2")}>제목2</button>
          <button type="button" onClick={() => insertBlock(activeId, "heading3")}>제목3</button>
          <button type="button" onClick={() => insertBlock(activeId, "bulleted_list_item")}>글머리표</button>
          <button type="button" onClick={() => insertBlock(activeId, "numbered_list_item")}>번호 목록</button>
          <button type="button" onClick={() => insertBlock(activeId, "checklist_item")}>체크리스트</button>
          <button type="button" onClick={() => insertBlock(activeId, "divider")}>구분선</button>
          <span style={{ width: 1, background: "var(--color-border)", margin: "0 4px" }} />
          <button type="button" onClick={() => applyInlineWrap("**")} title="굵게"><b>B</b></button>
          <button type="button" onClick={() => applyInlineWrap("*")} title="기울임"><i>I</i></button>
          <button type="button" onClick={() => applyInlineWrap("__")} title="밑줄"><u>U</u></button>
          <button
            type="button"
            onClick={() => {
              const url = prompt("링크 URL을 입력하세요 (https://...)");
              if (!url || !activeId) return;
              const el = refs.current.get(activeId);
              const block = content.blocks.find((b) => b.id === activeId);
              if (el && block && "text" in block) {
                const start = el.selectionStart ?? block.text.length;
                const end = el.selectionEnd ?? block.text.length;
                const label = block.text.slice(start, end) || "링크";
                const next = `${block.text.slice(0, start)}[${label}](${url})${block.text.slice(end)}`;
                updateBlock(activeId, { text: next } as Partial<PageBlock>);
              }
            }}
          >
            🔗 링크
          </button>
          <span style={{ width: 1, background: "var(--color-border)", margin: "0 4px" }} />
          <button type="button" onClick={() => setPicker("image")}>🖼 이미지 삽입</button>
          <button type="button" onClick={() => setPicker("file")}>📎 파일 첨부</button>
        </div>
      )}

      {picker && (
        <AttachmentPicker
          pageId={pageId}
          filterImagesOnly={picker === "image"}
          onPick={(a) => insertReferenceBlock(picker, a)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
