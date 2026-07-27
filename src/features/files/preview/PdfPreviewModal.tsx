import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Vite: bundle pdf.js's worker script and get a URL for it.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export function PdfPreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1.1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/attachments/${attachment.id}/preview`, { credentials: "include" });
        if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`);
        const buf = await res.arrayBuffer();
        const loaded = await pdfjsLib.getDocument({ data: buf }).promise;
        if (!cancelled) setDoc(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "PDF를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum, zoom]);

  return (
    <Modal
      title={attachment.fileName}
      onClose={onClose}
      headerExtra={
        <>
          {doc && (
            <>
              <button type="button" onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1}>
                ‹
              </button>
              <span style={{ fontSize: 12 }}>
                {pageNum} / {doc.numPages}
              </span>
              <button type="button" onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))} disabled={pageNum >= doc.numPages}>
                ›
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
                −
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                +
              </button>
            </>
          )}
          <a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>
        </>
      }
    >
      {loading && <p>불러오는 중…</p>}
      {error && (
        <div>
          <p style={{ color: "var(--color-danger)" }}>PDF 미리보기에 실패했습니다: {error}</p>
          <a href={`/api/attachments/${attachment.id}/download`}>원본 다운로드</a>
        </div>
      )}
      <canvas ref={canvasRef} style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
    </Modal>
  );
}
