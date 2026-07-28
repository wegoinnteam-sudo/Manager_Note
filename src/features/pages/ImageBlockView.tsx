import { useEffect, useRef, useState } from "react";
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
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const dragStart = useRef({ x: 0, width: block.width ?? 100 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const containerWidth = frameRef.current?.parentElement?.getBoundingClientRect().width;
      if (!containerWidth) return;
      const deltaPct = ((e.clientX - dragStart.current.x) / containerWidth) * 100;
      const next = dragging === "right" ? dragStart.current.width + deltaPct : dragStart.current.width - deltaPct;
      onPatch({ width: Math.min(100, Math.max(15, Math.round(next))) });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onPatch]);

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
        <div className="image-block__frame" ref={frameRef} style={{ width: `${block.width ?? 100}%` }}>
          <img src={src} alt={att?.fileName ?? "이미지"} />
          {editable && (
            <>
              <span
                className="image-block__handle image-block__handle--left"
                onMouseDown={(e) => {
                  dragStart.current = { x: e.clientX, width: block.width ?? 100 };
                  setDragging("left");
                }}
              />
              <span
                className="image-block__handle image-block__handle--right"
                onMouseDown={(e) => {
                  dragStart.current = { x: e.clientX, width: block.width ?? 100 };
                  setDragging("right");
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
