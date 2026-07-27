import type { AttachmentDTO } from "@shared/types";

const ICONS: Record<string, string> = {
  pdf: "📕",
  doc: "📘",
  docx: "📘",
  xls: "📗",
  xlsx: "📗",
  hwp: "📙",
  hwpx: "📙",
  zip: "🗜",
  txt: "📄",
  csv: "📊",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileCard({
  attachment,
  canDelete,
  onPreview,
  onDelete,
}: {
  attachment: AttachmentDTO;
  canDelete: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const icon = ICONS[attachment.extension.toLowerCase()] ?? "📎";

  return (
    <div className={`file-card${attachment.status === "failed" ? " file-card--failed" : ""}`}>
      {attachment.isImage ? (
        <img className="file-card__thumb" src={`/api/attachments/${attachment.id}/preview`} alt={attachment.fileName} onClick={onPreview} loading="lazy" />
      ) : (
        <div className="file-card__icon" onClick={onPreview}>
          {icon}
        </div>
      )}
      <div className="file-card__name" title={attachment.fileName}>
        {attachment.fileName}
      </div>
      <div className="file-card__meta">
        .{attachment.extension} · {formatSize(attachment.sizeBytes)} · {new Date(attachment.createdAt).toLocaleDateString("ko-KR")}
      </div>
      {attachment.status === "failed" && <div className="file-card__meta" style={{ color: "var(--color-danger)" }}>업로드 실패</div>}
      <div className="file-card__actions">
        <button type="button" onClick={onPreview}>
          미리보기
        </button>
        <a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>
        {canDelete && (
          <button type="button" onClick={onDelete}>
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
