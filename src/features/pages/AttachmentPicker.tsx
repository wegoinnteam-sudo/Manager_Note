import { useEffect, useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { api } from "@/lib/api";

export function AttachmentPicker({
  pageId,
  filterImagesOnly,
  onPick,
  onClose,
}: {
  pageId: string;
  filterImagesOnly: boolean;
  onPick: (attachment: AttachmentDTO) => void;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);

  useEffect(() => {
    api.listAttachments(pageId).then((r) => setAttachments(r.attachments.filter((a) => a.status === "ready")));
  }, [pageId]);

  const visible = filterImagesOnly ? attachments.filter((a) => a.isImage) : attachments;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <strong>{filterImagesOnly ? "이미지 선택" : "파일 선택"}</strong>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal__body" style={{ alignItems: "stretch" }}>
          {visible.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              먼저 아래 첨부파일 영역이나 화면 드래그앤드롭으로 파일을 업로드하세요.
            </p>
          )}
          {visible.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, background: "#fff", cursor: "pointer", textAlign: "left" }}
            >
              <span>{a.isImage ? "🖼" : "📎"}</span>
              <span style={{ fontSize: 13 }}>{a.fileName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
