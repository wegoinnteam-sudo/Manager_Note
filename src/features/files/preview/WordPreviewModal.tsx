import { useEffect, useState } from "react";
import mammoth from "mammoth";
import DOMPurify from "dompurify";
import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

export function WordPreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/attachments/${attachment.id}/preview`, { credentials: "include" });
        if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`);
        const buf = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "변환에 실패했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  return (
    <Modal title={attachment.fileName} onClose={onClose} headerExtra={<a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>}>
      {loading && <p>변환 중…</p>}
      {error && (
        <div>
          <p style={{ color: "var(--color-danger)" }}>
            이 문서는 브라우저에서 미리보기로 변환하지 못했습니다: {error}
          </p>
          <a href={`/api/attachments/${attachment.id}/download`}>원본 다운로드</a>
        </div>
      )}
      {html && (
        <div style={{ width: "100%", maxWidth: 720, background: "#fff" }} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </Modal>
  );
}
