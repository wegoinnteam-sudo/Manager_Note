import { useRef } from "react";
import type { AttachmentDTO, PageBlock } from "@shared/types";
import { renderInline } from "./inlineMarkdown";

const TEXTAREA_TYPES = new Set(["heading1", "heading2", "heading3", "paragraph", "bulleted_list_item", "numbered_list_item"]);

export function Block({
  block,
  index,
  active,
  attachmentsById,
  editable,
  onFocus,
  onChangeText,
  onToggleChecked,
  onKeyDownBlock,
  onRemoveImage,
  registerRef,
}: {
  block: PageBlock;
  index: number;
  active: boolean;
  attachmentsById: Map<string, AttachmentDTO>;
  editable: boolean;
  onFocus: () => void;
  onChangeText: (text: string) => void;
  onToggleChecked: () => void;
  onKeyDownBlock: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemoveImage: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  if (block.type === "divider") {
    return <hr className="divider" />;
  }

  if (block.type === "image") {
    const att = attachmentsById.get(block.attachmentId);
    return (
      <div className="block-row">
        {att ? (
          <img src={`/api/attachments/${att.id}/preview`} alt={att.fileName} style={{ maxWidth: "100%", borderRadius: 6 }} />
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>(삭제된 이미지)</div>
        )}
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveImage} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "file") {
    const att = attachmentsById.get(block.attachmentId);
    return (
      <div className="block-row">
        <a
          href={att ? `/api/attachments/${att.id}/download` : undefined}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, textDecoration: "none", color: "inherit", flex: 1 }}
        >
          📎 {att ? att.fileName : "(삭제된 파일)"}
        </a>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveImage} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "checklist_item") {
    return (
      <div className="block-row">
        <input type="checkbox" checked={block.checked} onChange={onToggleChecked} disabled={!editable} style={{ marginTop: 8 }} />
        {editable && active ? (
          <textarea
            ref={(el) => {
              localRef.current = el;
              registerRef(el);
            }}
            className="block-input"
            rows={1}
            value={block.text}
            onFocus={onFocus}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={onKeyDownBlock}
            autoFocus={active}
          />
        ) : (
          <div className="block-input" onClick={editable ? onFocus : undefined} style={{ textDecoration: block.checked ? "line-through" : undefined, color: block.checked ? "var(--color-text-muted)" : undefined }}>
            {renderInline(block.text) || <span style={{ opacity: 0.4 }}>{index === 0 ? "체크리스트" : ""}</span>}
          </div>
        )}
      </div>
    );
  }

  if (TEXTAREA_TYPES.has(block.type)) {
    const prefix = block.type === "bulleted_list_item" ? "• " : block.type === "numbered_list_item" ? `${index + 1}. ` : "";
    const cls =
      block.type === "heading1" ? "block-input block-input--h1" : block.type === "heading2" ? "block-input block-input--h2" : block.type === "heading3" ? "block-input block-input--h3" : "block-input";

    return (
      <div className="block-row">
        {prefix && <span style={{ paddingTop: 6, color: "var(--color-text-muted)" }}>{prefix}</span>}
        {editable && active ? (
          <textarea
            ref={(el) => {
              localRef.current = el;
              registerRef(el);
            }}
            className={cls}
            rows={1}
            value={block.text}
            placeholder={block.type === "paragraph" ? "내용을 입력하세요…" : ""}
            onFocus={onFocus}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={onKeyDownBlock}
            autoFocus={active}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />
        ) : (
          <div className={cls} onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default" }}>
            {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "내용을 입력하세요…" : ""}</span>}
          </div>
        )}
      </div>
    );
  }

  return null;
}
