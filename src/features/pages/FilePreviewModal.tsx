import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type SheetPreview = {
  name: string;
  rows: Array<Array<string | number | boolean>>;
  truncated: boolean;
};

type LoadedPreview =
  | { kind: "sheets"; sheets: SheetPreview[] }
  | { kind: "document"; html: string }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "unsupported"; message: string };

const TEXT_PREVIEW_LIMIT = 500_000;
const SHEET_ROW_LIMIT = 200;
const SHEET_COLUMN_LIMIT = 50;

function previewUrl(attachment: AttachmentDTO) {
  return `/api/attachments/${attachment.id}/preview`;
}

function isImage(attachment: AttachmentDTO) {
  return attachment.isImage || attachment.mimeType.startsWith("image/");
}

async function loadParsedPreview(attachment: AttachmentDTO, signal: AbortSignal): Promise<LoadedPreview> {
  const response = await fetch(previewUrl(attachment), { credentials: "include", signal });
  if (!response.ok) throw new Error(`파일 내용을 불러오지 못했습니다. (${response.status})`);

  const extension = attachment.extension.toLowerCase();
  if (["xls", "xlsx", "csv"].includes(extension)) {
    const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
    const sheets = workbook.SheetNames.map((name) => {
      const allRows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(workbook.Sheets[name], {
        header: 1,
        blankrows: false,
        defval: "",
      });
      return {
        name,
        rows: allRows.slice(0, SHEET_ROW_LIMIT).map((row) => row.slice(0, SHEET_COLUMN_LIMIT)),
        truncated: allRows.length > SHEET_ROW_LIMIT || allRows.some((row) => row.length > SHEET_COLUMN_LIMIT),
      };
    });
    return { kind: "sheets", sheets };
  }

  if (extension === "docx") {
    const result = await mammoth.convertToHtml({ arrayBuffer: await response.arrayBuffer() });
    return { kind: "document", html: DOMPurify.sanitize(result.value) };
  }

  if (extension === "txt") {
    const text = await response.text();
    return {
      kind: "text",
      text: text.slice(0, TEXT_PREVIEW_LIMIT),
      truncated: text.length > TEXT_PREVIEW_LIMIT,
    };
  }

  const unsupported: Record<string, string> = {
    doc: "구형 Word(.doc) 파일은 브라우저에서 안전하게 본문을 변환할 수 없습니다.",
    ppt: "구형 PowerPoint(.ppt) 파일은 브라우저에서 안전하게 슬라이드 내용을 변환할 수 없습니다.",
    pptx: "PowerPoint(.pptx) 파일은 현재 슬라이드 내용 미리보기를 지원하지 않습니다.",
    hwp: "HWP 파일은 브라우저에서 안전하게 본문을 변환할 수 없습니다.",
    hwpx: "HWPX 파일은 현재 본문 미리보기를 지원하지 않습니다.",
    zip: "ZIP 압축 파일은 내용 미리보기를 지원하지 않습니다.",
  };
  return {
    kind: "unsupported",
    message: unsupported[extension] ?? "이 파일 형식은 현재 내용 미리보기를 지원하지 않습니다.",
  };
}

function SpreadsheetPreview({ sheets }: { sheets: SheetPreview[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sheet = sheets[selectedIndex];

  useEffect(() => {
    setSelectedIndex(0);
  }, [sheets]);

  if (!sheet) return <div className="file-preview__empty">표시할 시트 내용이 없습니다.</div>;

  return (
    <div className="file-preview__spreadsheet">
      {sheets.length > 1 && (
        <div className="file-preview__sheet-tabs">
          {sheets.map((candidate, index) => (
            <button
              type="button"
              key={`${candidate.name}-${index}`}
              className={selectedIndex === index ? "file-preview__sheet-tab--active" : ""}
              onClick={() => setSelectedIndex(index)}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}
      <div className="file-preview__table-scroll">
        <table>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th>{rowIndex + 1}</th>
                {row.map((cell, columnIndex) => <td key={columnIndex}>{String(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated && <div className="file-preview__notice">미리보기는 최대 200행·50열까지만 표시합니다.</div>}
    </div>
  );
}

function PdfPreview({ attachment }: { attachment: AttachmentDTO }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let loadedDocument: PDFDocumentProxy | null = null;

    fetch(previewUrl(attachment), { credentials: "include", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`PDF 내용을 불러오지 못했습니다. (${response.status})`);
        return response.arrayBuffer();
      })
      .then((data) => getDocument({ data }).promise)
      .then((pdf) => {
        loadedDocument = pdf;
        setDocument(pdf);
        setPageNumber(1);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "PDF 내용을 불러오지 못했습니다.");
        }
      });

    return () => {
      controller.abort();
      loadedDocument?.destroy();
    };
  }, [attachment]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      return renderTask.promise;
    }).catch((reason) => {
      if (!cancelled && reason?.name !== "RenderingCancelledException") {
        setError("PDF 페이지를 표시하지 못했습니다.");
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  if (error) return <div className="file-preview__empty">{error}</div>;

  return (
    <div className="file-preview__pdf">
      <div className="file-preview__pdf-page">
        {!document && <div className="file-preview__empty">PDF 내용을 불러오는 중…</div>}
        <canvas ref={canvasRef} />
      </div>
      {document && (
        <div className="file-preview__pdf-controls">
          <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))}>
            이전
          </button>
          <span>{pageNumber} / {document.numPages}</span>
          <button type="button" disabled={pageNumber >= document.numPages} onClick={() => setPageNumber((page) => Math.min(document.numPages, page + 1))}>
            다음
          </button>
        </div>
      )}
    </div>
  );
}

export function FilePreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const extension = attachment.extension.toLowerCase();
  const directPreview =
    isImage(attachment) ||
    attachment.mimeType === "application/pdf" ||
    attachment.mimeType.startsWith("video/") ||
    attachment.mimeType.startsWith("audio/");
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (directPreview) return;
    const controller = new AbortController();
    setLoaded(null);
    setError(null);
    loadParsedPreview(attachment, controller.signal)
      .then(setLoaded)
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "파일 내용을 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, [attachment, directPreview]);

  let content: React.ReactNode;
  if (isImage(attachment)) {
    content = <img className="file-preview__image" src={previewUrl(attachment)} alt={attachment.fileName} />;
  } else if (attachment.mimeType === "application/pdf" || extension === "pdf") {
    content = <PdfPreview attachment={attachment} />;
  } else if (attachment.mimeType.startsWith("video/")) {
    content = <video className="file-preview__media" controls src={previewUrl(attachment)} />;
  } else if (attachment.mimeType.startsWith("audio/")) {
    content = <audio className="file-preview__audio" controls src={previewUrl(attachment)} />;
  } else if (error) {
    content = <div className="file-preview__empty">{error}</div>;
  } else if (!loaded) {
    content = <div className="file-preview__empty">파일 내용을 불러오는 중…</div>;
  } else if (loaded.kind === "sheets") {
    content = <SpreadsheetPreview sheets={loaded.sheets} />;
  } else if (loaded.kind === "document") {
    content = <article className="file-preview__document" dangerouslySetInnerHTML={{ __html: loaded.html }} />;
  } else if (loaded.kind === "text") {
    content = (
      <div className="file-preview__text-wrap">
        <pre className="file-preview__text">{loaded.text}</pre>
        {loaded.truncated && <div className="file-preview__notice">미리보기는 앞부분만 표시합니다.</div>}
      </div>
    );
  } else {
    content = (
      <div className="file-preview__empty">
        <strong>{attachment.fileName}</strong>
        <span>{loaded.message}</span>
      </div>
    );
  }

  return (
    <Modal title={`${attachment.fileName} 미리보기`} onClose={onClose}>
      <div className="file-preview">{content}</div>
    </Modal>
  );
}
