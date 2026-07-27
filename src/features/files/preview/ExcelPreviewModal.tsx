import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

const MAX_PREVIEW_ROWS = 200;

export function ExcelPreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/attachments/${attachment.id}/preview`, { credentials: "include" });
        if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        if (!cancelled) {
          setWorkbook(wb);
          setSheetName(wb.SheetNames[0] ?? "");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Excel 파일을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  const sheet = workbook && sheetName ? workbook.Sheets[sheetName] : null;
  const rows: unknown[][] = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) : [];
  const truncated = rows.length > MAX_PREVIEW_ROWS;
  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);

  return (
    <Modal
      title={attachment.fileName}
      onClose={onClose}
      headerExtra={
        <>
          {workbook && workbook.SheetNames.length > 1 && (
            <select value={sheetName} onChange={(e) => setSheetName(e.target.value)} style={{ fontSize: 12 }}>
              {workbook.SheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>
        </>
      }
    >
      {loading && <p>불러오는 중…</p>}
      {error && (
        <div>
          <p style={{ color: "var(--color-danger)" }}>Excel 미리보기에 실패했습니다: {error}</p>
          <a href={`/api/attachments/${attachment.id}/download`}>원본 다운로드</a>
        </div>
      )}
      {!loading && !error && (
        <div style={{ width: "100%", overflow: "auto" }}>
          {truncated && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              전체 {rows.length.toLocaleString()}행 중 처음 {MAX_PREVIEW_ROWS}행만 표시됩니다. 전체 내용은 다운로드하세요.
            </p>
          )}
          <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ border: "1px solid var(--color-border)", padding: "4px 8px", whiteSpace: "nowrap" }}>
                      {cell === undefined || cell === null ? "" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
