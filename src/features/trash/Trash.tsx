import { useCallback, useEffect, useState } from "react";
import type { PageSummaryDTO } from "@shared/types";
import { api } from "@/lib/api";

export function Trash({ canRestore, onOpenPage, onRestored }: { canRestore: boolean; onOpenPage: (id: string) => void; onRestored: () => void }) {
  const [pages, setPages] = useState<PageSummaryDTO[]>([]);

  const refresh = useCallback(async () => {
    const { pages: rows } = await api.listPages({ trash: true });
    setPages(rows);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restore = async (id: string) => {
    await api.restorePage(id);
    await refresh();
    onRestored();
  };

  return (
    <div className="page-view">
      <h2>휴지통</h2>
      {pages.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>휴지통이 비어 있습니다.</p>}
      {pages.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
          <span style={{ cursor: "pointer" }} onClick={() => onOpenPage(p.id)}>
            {p.title}
          </span>
          {canRestore && (
            <button type="button" onClick={() => restore(p.id)} style={{ fontSize: 12, border: "1px solid var(--color-border)", background: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              복원
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
