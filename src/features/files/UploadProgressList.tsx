import type { UploadItem } from "./useUploadQueue";

export function UploadProgressList({ items, onCancel, onDismiss }: { items: UploadItem[]; onCancel: (id: string) => void; onDismiss: (id: string) => void }) {
  const active = items.filter((it) => it.status !== "success");
  if (active.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
      {active.map((it) => (
        <div key={it.id} className={`file-card${it.status === "error" ? " file-card--failed" : " file-card--pending"}`} style={{ maxWidth: 360 }}>
          <div className="file-card__name">{it.fileName}</div>
          {it.status === "uploading" && (
            <div className="upload-progress">
              <div className="upload-progress__bar" style={{ width: `${it.progress}%` }} />
            </div>
          )}
          {it.status === "error" && <div className="file-card__meta" style={{ color: "var(--color-danger)" }}>{it.errorMessage}</div>}
          <div className="file-card__actions">
            {it.status === "uploading" && (
              <button type="button" onClick={() => onCancel(it.id)}>
                취소
              </button>
            )}
            {it.status === "error" && (
              <button type="button" onClick={() => onDismiss(it.id)}>
                닫기
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
