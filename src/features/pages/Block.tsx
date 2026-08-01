import { useEffect, useRef, useState } from "react";
import type { AttachmentDTO, PageBlock, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import type { PresenceUser } from "@/hooks/usePresence";
import { renderInline } from "./inlineMarkdown";
import { api } from "@/lib/api";
import { DatabaseView } from "./DatabaseView";
import { ChartView } from "./ChartView";
import { FormBlockView } from "./FormBlockView";
import { ImageBlockView } from "./ImageBlockView";
import { FileBlockView } from "./FileBlockView";
import { TableBlockView } from "./TableBlockView";
import { SecretBlockView } from "./SecretBlockView";
import { RemoteCaretMarkers, RemotePresenceBadge } from "./RemoteCursors";
import type { TemplateKey } from "./templates";

const TEXTAREA_TYPES = new Set(["heading1", "heading2", "heading3", "paragraph", "bulleted_list_item", "numbered_list_item"]);

export type HeadingRef = { id: string; text: string; level: 1 | 2 | 3 };

function fitTextareaToContent(element: HTMLTextAreaElement | null): void {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function PageLinkRow({ pageId, onOpenPage }: { pageId: string; onOpenPage: (id: string) => void }) {
  const [title, setTitle] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPage(pageId)
      .then((page) => {
        if (!cancelled) setTitle(page.title);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (missing) {
    return <span className="page-link-block__title" style={{ color: "var(--color-text-muted)" }}>(삭제된 페이지)</span>;
  }

  return (
    <button type="button" className="page-link-block" onClick={() => onOpenPage(pageId)}>
      <span className="page-link-block__icon">📄</span>
      <span className="page-link-block__title">{title ?? "불러오는 중…"}</span>
    </button>
  );
}

export function Block({
  block,
  index,
  active,
  attachmentsById,
  headings,
  editable,
  onFocus,
  onChangeText,
  onToggleChecked,
  onKeyDownBlock,
  onPasteBlock,
  onRemoveBlock,
  onInsertParagraphAfter,
  onDuplicateBlock,
  onPatch,
  onOpenPage,
  onPeekPage,
  currentPageId,
  pages,
  members,
  onPagesChanged,
  onInsertTemplateAfter,
  onReplaceImage,
  remoteCursors,
  registerRef,
  canViewSensitive,
}: {
  block: PageBlock;
  index: number;
  active: boolean;
  attachmentsById: Map<string, AttachmentDTO>;
  headings: HeadingRef[];
  editable: boolean;
  onFocus: () => void;
  onChangeText: (text: string, caret: number) => void;
  onToggleChecked: () => void;
  onKeyDownBlock: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteBlock: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveBlock: () => void;
  onInsertParagraphAfter: () => void;
  onDuplicateBlock: () => void;
  onPatch: (patch: Partial<PageBlock>) => void;
  onOpenPage: (pageId: string) => void;
  onPeekPage: (pageId: string, label?: string, anchorLeft?: number) => void;
  currentPageId: string;
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
  onPagesChanged: () => void;
  onInsertTemplateAfter: (afterId: string, templateKey: TemplateKey) => void;
  onReplaceImage: (blockId: string) => void;
  remoteCursors: PresenceUser[];
  registerRef: (el: HTMLTextAreaElement | null) => void;
  canViewSensitive: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [, bumpRender] = useState(0);
  const editableText = "text" in block ? block.text : "";
  useEffect(() => {
    bumpRender((v) => v + 1);
  }, [active]);
  useEffect(() => {
    fitTextareaToContent(localRef.current);
  }, [active, editableText]);
  const domId = `block-${block.id}`;
  const remoteMarkers = active && editable ? <RemoteCaretMarkers textarea={localRef.current} users={remoteCursors} /> : <RemotePresenceBadge users={remoteCursors} />;

  if (block.type === "divider") {
    return <hr id={domId} className="divider" />;
  }

  if (block.type === "image") {
    return (
      <div id={domId}>
        <ImageBlockView
          block={block}
          attachmentsById={attachmentsById}
          editable={editable}
          onPatch={onPatch}
          onRemoveBlock={onRemoveBlock}
          onReplace={() => onReplaceImage(block.id)}
        />
      </div>
    );
  }

  if (block.type === "file") {
    return (
      <div id={domId}>
        <FileBlockView attachment={attachmentsById.get(block.attachmentId)} editable={editable} onRemove={onRemoveBlock} />
      </div>
    );
  }

  if (block.type === "embed") {
    const youtubeId = block.url.match(/(?:youtu\.be\/|[?&]v=)([\w-]{6,})/)?.[1];
    const src = youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : block.url;
    return (
      <div id={domId} className="block-row">
        <div className="embed-block">
          <iframe src={src} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "bookmark") {
    let host = block.url;
    try {
      host = new URL(block.url).hostname;
    } catch {
      /* keep raw url as fallback label */
    }
    return (
      <div id={domId} className="block-row">
        <a className="bookmark-block" href={block.url} target="_blank" rel="noreferrer noopener">
          <span className="bookmark-block__icon">🔗</span>
          <span className="bookmark-block__url">{host}</span>
        </a>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "toc") {
    return (
      <div id={domId} className="block-row">
        <div className="toc-block">
          <div className="toc-block__label">목차</div>
          {headings.length === 0 && <div className="toc-block__empty">문서에 제목이 없습니다</div>}
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`toc-block__item toc-block__item--${h.level}`}
              onClick={() => document.getElementById(`block-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {h.text || "(제목 없음)"}
            </button>
          ))}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "page_link") {
    return (
      <div id={domId} className="block-row">
        <PageLinkRow pageId={block.pageId} onOpenPage={onOpenPage} />
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "database_view") {
    return (
      <div id={domId} className="block-row">
        <DatabaseView
          block={block}
          parentId={currentPageId}
          pages={pages}
          members={members}
          editable={editable}
          onOpenPage={onOpenPage}
          onPeekPage={onPeekPage}
          onPagesChanged={onPagesChanged}
          onPatch={onPatch}
          onDuplicate={onDuplicateBlock}
          onRemove={onRemoveBlock}
        />
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "chart") {
    return (
      <div id={domId} className="block-row">
        <ChartView parentId={currentPageId} pages={pages} />
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "form") {
    return (
      <div id={domId} className="block-row">
        <FormBlockView formKey={block.formKey} parentId={currentPageId} editable={editable} onPagesChanged={onPagesChanged} onOpenPage={onOpenPage} />
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "secret") {
    return (
      <div id={domId} className="block-row">
        <SecretBlockView
          pageId={currentPageId}
          blockId={block.id}
          label={block.label}
          editable={editable}
          canView={canViewSensitive}
          onLabelChange={(label) => onPatch({ label })}
        />
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "button") {
    return (
      <div id={domId} className="block-row">
        <button type="button" className="button-block" disabled={!editable} onClick={() => onInsertTemplateAfter(block.id, block.templateKey)}>
          {block.label}
        </button>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "columns") {
    const cols = block.columns;
    const updateColumn = (i2: number, value: string) => {
      onPatch({ columns: cols.map((c, ci) => (ci === i2 ? value : c)) });
    };
    const addColumn = () => cols.length < 5 && onPatch({ columns: [...cols, ""] });
    const removeColumn = (i2: number) => cols.length > 2 && onPatch({ columns: cols.filter((_, ci) => ci !== i2) });

    return (
      <div id={domId} className="block-row">
        <div className="columns-block">
          <div className="columns-block__grid" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
            {cols.map((c, ci) => (
              <div key={ci} className="columns-block__col">
                {editable && cols.length > 2 && (
                  <button type="button" className="columns-block__col-remove" onClick={() => removeColumn(ci)} title="열 삭제">
                    ✕
                  </button>
                )}
                <textarea
                  className="columns-block__textarea"
                  value={c}
                  disabled={!editable}
                  placeholder={`${ci + 1}번째 단`}
                  onChange={(e) => updateColumn(ci, e.target.value)}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
              </div>
            ))}
          </div>
          {editable && cols.length < 5 && (
            <button type="button" className="columns-block__add" onClick={addColumn}>
              + 단 추가
            </button>
          )}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "table") {
    return (
      <div id={domId}>
        <TableBlockView
          block={block}
          editable={editable}
          onPatch={onPatch}
          onRemoveBlock={onRemoveBlock}
          onInsertParagraphAfter={onInsertParagraphAfter}
        />
      </div>
    );
  }

  if (block.type === "toggle") {
    return (
      <div id={domId} className="block-row block-row--toggle">
        <button type="button" className="toggle-caret" onClick={() => onPatch({ expanded: !block.expanded })} title={block.expanded ? "접기" : "펼치기"}>
          {block.expanded ? "▾" : "▸"}
        </button>
        <div className="toggle-block__body-wrap">
          <div style={{ position: "relative" }}>
            {editable && active ? (
              <textarea
                ref={(el) => {
                  localRef.current = el;
                  registerRef(el);
                  fitTextareaToContent(el);
                }}
                className="block-input"
                rows={1}
                value={block.text}
                placeholder="토글 제목"
                onFocus={onFocus}
                onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onKeyDown={onKeyDownBlock}
                onPaste={onPasteBlock}
                autoFocus={active}
              />
            ) : (
              <div className="block-input" onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default", fontWeight: 600 }}>
                {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "토글 제목" : ""}</span>}
              </div>
            )}
            {remoteMarkers}
          </div>
          {block.expanded && (
            <textarea
              ref={fitTextareaToContent}
              className="toggle-block__body"
              rows={2}
              value={block.body}
              placeholder="내용을 입력하세요…"
              disabled={!editable}
              onChange={(e) => onPatch({ body: e.target.value })}
              onPaste={onPasteBlock}
              onInput={(e) => fitTextareaToContent(e.currentTarget)}
            />
          )}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "callout") {
    return (
      <div id={domId} className="block-row">
        <div className="callout-block">
          <span className="callout-block__icon">💡</span>
          <div style={{ position: "relative", flex: 1 }}>
            {editable && active ? (
              <textarea
                ref={(el) => {
                  localRef.current = el;
                  registerRef(el);
                }}
                className="block-input"
                rows={1}
                value={block.text}
                placeholder="강조할 내용을 입력하세요"
                onFocus={onFocus}
                onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onKeyDown={onKeyDownBlock}
                onPaste={onPasteBlock}
                autoFocus={active}
              />
            ) : (
              <div className="block-input" onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default" }}>
                {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "강조할 내용을 입력하세요" : ""}</span>}
              </div>
            )}
            {remoteMarkers}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === "quote") {
    return (
      <div id={domId} className="block-row">
        <div className="quote-block" style={{ position: "relative" }}>
          {editable && active ? (
            <textarea
              ref={(el) => {
                localRef.current = el;
                registerRef(el);
                fitTextareaToContent(el);
              }}
              className="block-input"
              rows={1}
              value={block.text}
              placeholder="인용할 내용을 입력하세요"
              onFocus={onFocus}
              onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKeyDownBlock}
              onPaste={onPasteBlock}
              autoFocus={active}
            />
          ) : (
            <div className="block-input" onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default" }}>
              {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "인용할 내용을 입력하세요" : ""}</span>}
            </div>
          )}
          {remoteMarkers}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "code" || block.type === "equation") {
    const isCode = block.type === "code";
    return (
      <div id={domId} className="block-row">
        <div className={isCode ? "code-block" : "equation-block"}>
          {isCode && editable && (
            <input
              className="code-block__language"
              value={block.language ?? "plain"}
              aria-label="코드 언어"
              onChange={(e) => onPatch({ language: e.target.value })}
            />
          )}
          {editable ? (
            <textarea
              ref={(el) => {
                localRef.current = el;
                registerRef(el);
                fitTextareaToContent(el);
              }}
              value={block.text}
              rows={isCode ? 4 : 2}
              placeholder={isCode ? "코드를 입력하세요…" : "수식을 입력하세요…"}
              onFocus={onFocus}
              onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKeyDownBlock}
              onInput={(e) => fitTextareaToContent(e.currentTarget)}
            />
          ) : (
            isCode ? <pre><code>{block.text}</code></pre> : <div className="equation-block__value">{block.text}</div>
          )}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "breadcrumb") {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const chain: PageSummaryDTO[] = [];
    let current = byId.get(currentPageId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return (
      <div id={domId} className="block-row">
        <div className="breadcrumb-block">
          {chain.length === 0 && <span className="breadcrumb-block__item">(최상위 페이지)</span>}
          {chain.map((p, i) => (
            <span key={p.id} className="breadcrumb-block__segment">
              {i === chain.length - 1 ? (
                <span className="breadcrumb-block__item breadcrumb-block__item--current">{p.title}</span>
              ) : (
                <button type="button" className="breadcrumb-block__item" onClick={() => onOpenPage(p.id)}>
                  {p.title}
                </button>
              )}
              {i < chain.length - 1 && <span className="breadcrumb-block__sep">›</span>}
            </span>
          ))}
        </div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "checklist_item") {
    return (
      <div id={domId} className="block-row">
        <input type="checkbox" checked={block.checked} onChange={onToggleChecked} disabled={!editable} style={{ marginTop: 8 }} />
        <div style={{ position: "relative", flex: 1 }}>
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
              onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKeyDownBlock}
              onPaste={onPasteBlock}
              autoFocus={active}
            />
          ) : (
            <div className="block-input" onClick={editable ? onFocus : undefined} style={{ textDecoration: block.checked ? "line-through" : undefined, color: block.checked ? "var(--color-text-muted)" : undefined }}>
              {renderInline(block.text) || <span style={{ opacity: 0.4 }}>{index === 0 ? "체크리스트" : ""}</span>}
            </div>
          )}
          {remoteMarkers}
        </div>
      </div>
    );
  }

  if (TEXTAREA_TYPES.has(block.type)) {
    const prefix = block.type === "bulleted_list_item" ? "• " : block.type === "numbered_list_item" ? `${index + 1}. ` : "";
    const cls =
      block.type === "heading1" ? "block-input block-input--h1" : block.type === "heading2" ? "block-input block-input--h2" : block.type === "heading3" ? "block-input block-input--h3" : "block-input";

    return (
      <div id={domId} className="block-row">
        {prefix && <span style={{ paddingTop: 6, color: "var(--color-text-muted)" }}>{prefix}</span>}
        <div style={{ position: "relative", flex: 1 }}>
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
              onChange={(e) => onChangeText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKeyDownBlock}
              onPaste={onPasteBlock}
              autoFocus={active}
              onInput={(e) => fitTextareaToContent(e.currentTarget)}
            />
          ) : (
            <div className={cls} onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default" }}>
              {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "내용을 입력하세요…" : ""}</span>}
            </div>
          )}
          {remoteMarkers}
        </div>
      </div>
    );
  }

  return null;
}
