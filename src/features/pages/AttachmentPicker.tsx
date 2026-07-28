import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { api } from "@/lib/api";
import { useUploadQueue } from "@/features/files/useUploadQueue";

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
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);

  const refresh = useCallback(() => {
    api.listAttachments(pageId).then((r) => setAttachments(r.attachments.filter((a) => a.status === "ready")));
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { items, addFiles } = useUploadQueue(pageId, refresh);

  useEffect(() => {
    if (pickedRef.current) return;
    const done = items.find((it) => it.status === "success" && it.attachment && (!filterImagesOnly || it.attachment.isImage));
    if (done?.attachment) {
      pickedRef.current = true;
      onPick(done.attachment);
    }
  }, [items, filterImagesOnly, onPick]);

  const rejected = items.find((it) => it.status === "success" && it.attachment && filterImagesOnly && !it.attachment.isImage);

  const visible = filterImagesOnly ? attachments.filter((a) => a.isImage) : attachments;
  const uploading = items.filter((it) => it.status === "uploading");
  const failed = items.filter((it) => it.status === "error");

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
          <div
            className={`attachment-picker__dropzone${dragging ? " attachment-picker__dropzone--active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={filterImagesOnly ? "image/*" : undefined}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading.length > 0 ? `업로드 중… (${uploading.length})` : `여기로 파일을 드래그하거나 클릭해서 ${filterImagesOnly ? "이미지" : "파일"}을 올리세요`}
          </div>

          {rejected && <p style={{ fontSize: 12, color: "var(--color-danger)" }}>이미지 파일만 여기서 바로 삽입할 수 있어요. 업로드는 됐지만 첨부파일 목록에서 확인하세요.</p>}
          {failed.map((it) => (
            <p key={it.id} style={{ fontSize: 12, color: "var(--color-danger)" }}>
              {it.fileName}: {it.errorMessage}
            </p>
          ))}

          {visible.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>아직 업로드된 파일이 없습니다.</p>
          ) : (
            <>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 8 }}>
                이미 업로드된 파일에서 선택
              </p>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
