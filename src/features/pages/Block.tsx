import { useEffect, useRef, useState } from "react";
import type { AttachmentDTO, PageBlock } from "@shared/types";
import { renderInline } from "./inlineMarkdown";
import { api } from "@/lib/api";

const TEXTAREA_TYPES = new Set(["heading1", "heading2", "heading3", "paragraph", "bulleted_list_item", "numbered_list_item"]);

export type HeadingRef = { id: string; text: string; level: 1 | 2 | 3 };

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
  onRemoveBlock,
  onPatch,
  onOpenPage,
  registerRef,
}: {
  block: PageBlock;
  index: number;
  active: boolean;
  attachmentsById: Map<string, AttachmentDTO>;
  headings: HeadingRef[];
  editable: boolean;
  onFocus: () => void;
  onChangeText: (text: string) => void;
  onToggleChecked: () => void;
  onKeyDownBlock: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemoveBlock: () => void;
  onPatch: (patch: Partial<PageBlock>) => void;
  onOpenPage: (pageId: string) => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const domId = `block-${block.id}`;

  if (block.type === "divider") {
    return <hr id={domId} className="divider" />;
  }

  if (block.type === "image") {
    const att = attachmentsById.get(block.attachmentId);
    return (
      <div id={domId} className="block-row">
        {att ? (
          <img src={`/api/attachments/${att.id}/preview`} alt={att.fileName} style={{ maxWidth: "100%", borderRadius: 6 }} />
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>(삭제된 이미지)</div>
        )}
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  if (block.type === "file") {
    const att = attachmentsById.get(block.attachmentId);
    return (
      <div id={domId} className="block-row">
        <a
          href={att ? `/api/attachments/${att.id}/download` : undefined}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, textDecoration: "none", color: "inherit", flex: 1 }}
        >
          📎 {att ? att.fileName : "(삭제된 파일)"}
        </a>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
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
    const rows = block.rows;
    const updateCell = (r: number, c: number, value: string) => {
      onPatch({ rows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)) });
    };
    const addRow = () => onPatch({ rows: [...rows, rows[0].map(() => "")] });
    const addColumn = () => onPatch({ rows: rows.map((row) => [...row, ""]) });
    const removeRow = (r: number) => rows.length > 1 && onPatch({ rows: rows.filter((_, ri) => ri !== r) });
    const removeColumn = (c: number) => rows[0].length > 1 && onPatch({ rows: rows.map((row) => row.filter((_, ci) => ci !== c)) });

    return (
      <div id={domId} className="block-row">
        <div className="table-block">
          <table>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      {editable ? (
                        <input value={cell} onChange={(e) => updateCell(r, c, e.target.value)} />
                      ) : (
                        <span>{cell}</span>
                      )}
                    </td>
                  ))}
                  {editable && (
                    <td className="table-block__row-actions">
                      <button type="button" onClick={() => removeRow(r)} title="행 삭제">
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {editable && (
                <tr>
                  {rows[0].map((_, c) => (
                    <td key={c} className="table-block__col-actions">
                      <button type="button" onClick={() => removeColumn(c)} title="열 삭제">
                        ✕
                      </button>
                    </td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          {editable && (
            <div className="table-block__actions">
              <button type="button" onClick={addRow}>
                + 행
              </button>
              <button type="button" onClick={addColumn}>
                + 열
              </button>
            </div>
          )}
        </div>
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
          {editable && active ? (
            <textarea
              ref={(el) => {
                localRef.current = el;
                registerRef(el);
              }}
              className="block-input"
              rows={1}
              value={block.text}
              placeholder="토글 제목"
              onFocus={onFocus}
              onChange={(e) => onChangeText(e.target.value)}
              onKeyDown={onKeyDownBlock}
              autoFocus={active}
            />
          ) : (
            <div className="block-input" onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default", fontWeight: 600 }}>
              {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "토글 제목" : ""}</span>}
            </div>
          )}
          {block.expanded && (
            <textarea
              className="toggle-block__body"
              rows={2}
              value={block.body}
              placeholder="내용을 입력하세요…"
              disabled={!editable}
              onChange={(e) => onPatch({ body: e.target.value })}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
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
              onChange={(e) => onChangeText(e.target.value)}
              onKeyDown={onKeyDownBlock}
              autoFocus={active}
            />
          ) : (
            <div className="block-input" onClick={editable ? onFocus : undefined} style={{ minHeight: 24, cursor: editable ? "text" : "default" }}>
              {block.text ? renderInline(block.text) : <span style={{ opacity: 0.35 }}>{editable ? "강조할 내용을 입력하세요" : ""}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "checklist_item") {
    return (
      <div id={domId} className="block-row">
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
      <div id={domId} className="block-row">
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
