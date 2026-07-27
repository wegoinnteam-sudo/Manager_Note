import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

const REASONS: Record<string, string> = {
  hwp: "HWP 형식은 브라우저에서 직접 미리보기를 지원하지 않습니다. 원본을 다운로드해 한글(HWP) 뷰어로 열어주세요.",
  hwpx: "HWPX 형식은 브라우저에서 직접 미리보기를 지원하지 않습니다. 원본을 다운로드해 한글(HWP) 뷰어로 열어주세요.",
  doc: "이전 버전 Word(.doc) 형식은 브라우저 미리보기를 지원하지 않습니다. 원본을 다운로드해 확인해주세요.",
};

export function UnsupportedPreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const reason =
    REASONS[attachment.extension.toLowerCase()] ??
    "이 파일 형식은 브라우저 미리보기를 지원하지 않습니다. 원본을 다운로드해주세요.";

  return (
    <Modal title={attachment.fileName} onClose={onClose} headerExtra={<a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>}>
      <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{reason}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {attachment.fileName} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
        </p>
        <a
          href={`/api/attachments/${attachment.id}/download`}
          style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, textDecoration: "none", color: "inherit" }}
        >
          ↓ 원본 다운로드
        </a>
      </div>
    </Modal>
  );
}
