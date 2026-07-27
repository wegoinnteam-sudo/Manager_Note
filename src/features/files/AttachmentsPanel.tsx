import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { api } from "@/lib/api";
import { useUploadQueue } from "./useUploadQueue";
import { FileCard } from "./FileCard";
import { UploadProgressList } from "./UploadProgressList";
import { FilePreview } from "./preview/FilePreview";

export function AttachmentsPanel({ pageId, canEdit, registerFileDropHandler }: {
  pageId: string;
  canEdit: boolean;
  registerFileDropHandler: (handler: (files: FileList) => void) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [previewing, setPreviewing] = useState<AttachmentDTO | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const { attachments: rows } = await api.listAttachments(pageId);
    setAttachments(rows);
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { items, addFiles, cancel, dismiss } = useUploadQueue(pageId, refresh);

  useEffect(() => {
    registerFileDropHandler(addFiles);
  }, [registerFileDropHandler, addFiles]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("이 파일을 삭제할까요?")) return;
      await api.deleteAttachment(id);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="section">
      <div className="section__title">첨부파일</div>

      {canEdit && (
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
            파일 선택 (또는 화면 어디에나 드래그하여 놓기)
          </button>
        </div>
      )}

      <UploadProgressList items={items} onCancel={cancel} onDismiss={dismiss} />

      {attachments.length === 0 && items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>첨부된 파일이 없습니다.</p>
      ) : (
        <div className="file-grid">
          {attachments.map((att) => (
            <FileCard key={att.id} attachment={att} canDelete={canEdit} onPreview={() => setPreviewing(att)} onDelete={() => handleDelete(att.id)} />
          ))}
        </div>
      )}

      {previewing && <FilePreview attachment={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}
