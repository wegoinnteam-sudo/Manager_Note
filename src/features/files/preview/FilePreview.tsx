import { Suspense, lazy } from "react";
import type { AttachmentDTO } from "@shared/types";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { UnsupportedPreviewModal } from "./UnsupportedPreviewModal";

// Each of these pulls in a heavy parsing library (pdf.js / SheetJS /
// mammoth). Loading them lazily keeps the initial bundle small — most
// sessions never open a PDF/Excel/Word preview at all.
const PdfPreviewModal = lazy(() => import("./PdfPreviewModal").then((m) => ({ default: m.PdfPreviewModal })));
const ExcelPreviewModal = lazy(() => import("./ExcelPreviewModal").then((m) => ({ default: m.ExcelPreviewModal })));
const WordPreviewModal = lazy(() => import("./WordPreviewModal").then((m) => ({ default: m.WordPreviewModal })));

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const EXCEL_EXT = new Set(["xls", "xlsx"]);

export function FilePreview({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const ext = attachment.extension.toLowerCase();

  if (IMAGE_EXT.has(ext)) return <ImagePreviewModal attachment={attachment} onClose={onClose} />;

  if (ext === "pdf" || EXCEL_EXT.has(ext) || ext === "docx") {
    return (
      <Suspense fallback={<div className="modal-backdrop"><div className="modal" style={{ padding: 24 }}>불러오는 중…</div></div>}>
        {ext === "pdf" && <PdfPreviewModal attachment={attachment} onClose={onClose} />}
        {EXCEL_EXT.has(ext) && <ExcelPreviewModal attachment={attachment} onClose={onClose} />}
        {ext === "docx" && <WordPreviewModal attachment={attachment} onClose={onClose} />}
      </Suspense>
    );
  }

  return <UnsupportedPreviewModal attachment={attachment} onClose={onClose} />;
}
