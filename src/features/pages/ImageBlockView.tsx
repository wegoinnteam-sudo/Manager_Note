import { useRef } from "react";
import type { AttachmentDTO, PageBlock } from "@shared/types";

type ImageBlock = Extract<PageBlock, { type: "image" }>;

export function ImageBlockView({
  block,
  attachmentsById,
  editable,
  onPatch,
  onRemoveBlock,
  onReplace,
}: {
  block: ImageBlock;
  attachmentsById: Map<string, AttachmentDTO>;
  editable: boolean;
  onPatch: (patch: Partial<PageBlock>) => void;
  onRemoveBlock: () => void;
  onReplace: () => void;
}) {
  const att = block.attachmentId ? attachmentsById.get(block.attachmentId) : undefined;
  const src = block.url ? block.url : att ? `/api/attachments/${att.id}/preview` : null;
  const downloadHref = block.url ? block.url : att ? `/api/attachments/${att.id}/download` : undefined;

  const frameRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ side: "left" | "right"; pointerId: number } | null>(null);
  const dragStart = useRef({ x: 0, width: block.width ?? 100 });

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, side: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { x: e.clientX, width: block.width ?? 100 };
    resizing.current = { side, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const resize = (e: React.PointerEvent<HTMLSpanElement>) => {
    const current = resizing.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const containerWidth = frameRef.current?.parentElement?.getBoundingClientRect().width;
    if (!containerWidth) return;
    const deltaPct = ((e.clientX - dragStart.current.x) / containerWidth) * 100;
    const next = current.side === "right" ? dragStart.current.width + deltaPct : dragStart.current.width - deltaPct;
    onPatch({ width: Math.min(100, Math.max(15, Math.round(next))) });
  };

  const stopResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (resizing.current?.pointerId !== e.pointerId) return;
    resizing.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (!src) {
    return (
      <div className="block-row">
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>(삭제된 이미지)</div>
        {editable && (
          <button type="button" className="block-row__handle" onClick={onRemoveBlock} title="블록 제거">
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="block-row">
      <div className="image-block">
        <div
          className="image-block__frame"
          ref={frameRef}
          style={{
            width: `${block.width ?? 100}%`,
            marginLeft: block.align === "right" ? "auto" : block.align === "center" ? "auto" : 0,
            marginRight: block.align === "left" || !block.align ? "auto" : block.align === "center" ? "auto" : 0,
          }}
        >
          <img src={src} alt={att?.fileName ?? "이미지"} draggable={false} />
          {editable && (
            <>
              <span
                className="image-block__handle image-block__handle--left"
                onPointerDown={(e) => startResize(e, "left")}
                onPointerMove={resize}
                onPointerUp={stopResize}
                onPointerCancel={stopResize}
                onLostPointerCapture={() => {
                  resizing.current = null;
                }}
              />
              <span
                className="image-block__handle image-block__handle--right"
                onPointerDown={(e) => startResize(e, "right")}
                onPointerMove={resize}
                onPointerUp={stopResize}
                onPointerCancel={stopResize}
                onLostPointerCapture={() => {
                  resizing.current = null;
                }}
              />
              <div className="image-block__toolbar">
                <button type="button" onClick={onReplace} title="교체">
                  🔄
                </button>
                <a href={downloadHref} download title="다운로드">
                  ⬇
                </a>
                <button type="button" onClick={onRemoveBlock} title="삭제">
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
        {editable ? (
          <input
            className="image-block__caption"
            type="text"
            placeholder="캡션 작성…"
            value={block.caption ?? ""}
            onChange={(e) => onPatch({ caption: e.target.value })}
          />
        ) : (
          block.caption && <div className="image-block__caption image-block__caption--readonly">{block.caption}</div>
        )}
      </div>
    </div>
  );
}
