import { useEffect, useState } from "react";
import type { AttachmentDTO, PageSummaryDTO } from "@shared/types";
import { api } from "@/lib/api";

export function SearchResults({ query, onOpenPage }: { query: string; onOpenPage: (id: string) => void }) {
  const [pages, setPages] = useState<PageSummaryDTO[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);

  useEffect(() => {
    api.search(query).then((r) => {
      setPages(r.pages);
      setAttachments(r.attachments);
    });
  }, [query]);

  return (
    <div className="page-view">
      <h2>"{query}" 검색 결과</h2>

      <div className="section">
        <div className="section__title">페이지 ({pages.length})</div>
        {pages.map((p) => (
          <div key={p.id} style={{ padding: "6px 0", cursor: "pointer" }} onClick={() => onOpenPage(p.id)}>
            {p.title}
          </div>
        ))}
        {pages.length === 0 && <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>일치하는 페이지가 없습니다.</p>}
      </div>

      <div className="section">
        <div className="section__title">파일 ({attachments.length})</div>
        {attachments.map((a) => (
          <div key={a.id} style={{ padding: "6px 0", cursor: "pointer" }} onClick={() => onOpenPage(a.pageId)}>
            📎 {a.fileName}
          </div>
        ))}
        {attachments.length === 0 && <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>일치하는 파일이 없습니다.</p>}
      </div>
    </div>
  );
}
