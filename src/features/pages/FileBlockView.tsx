import { useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { FilePreviewModal } from "./FilePreviewModal";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBlockView({
  attachment,
  editable,
  onRemove,
}: {
  attachment: AttachmentDTO | undefined;
  editable: boolean;
  onRemove: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="block-row file-block">
        <a
          draggable={false}
          className="file-block__identity"
          href={attachment ? `/api/attachments/${attachment.id}/download` : undefined}
        >
          <span className="file-block__icon">📎</span>
          <span className="file-block__name">
            {attachment?.fileName ?? "(삭제된 파일)"}
            {attachment && <small>{attachment.extension.toUpperCase()} · {formatFileSize(attachment.sizeBytes)}</small>}
          </span>
        </a>
        {attachment && (
          <button type="button" className="file-block__preview" onClick={() => setPreviewOpen(true)}>
            미리보기
          </button>
        )}
        {editable && (
          <button type="button" className="file-block__remove" onClick={onRemove} title="블록 제거" aria-label="블록 제거">
            ✕
          </button>
        )}
      </div>
      {previewOpen && attachment && <FilePreviewModal attachment={attachment} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}
