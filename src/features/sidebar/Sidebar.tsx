import { useMemo, useState } from "react";
import type { PageSummaryDTO, UserDTO } from "@shared/types";
import { buildPageTree, type PageTreeNode } from "@/hooks/usePages";

function PageTreeRow({
  node,
  depth,
  activeId,
  onOpen,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className={`page-tree__row${node.page.id === activeId ? " page-tree__row--active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onOpen(node.page.id)}
      >
        <button
          type="button"
          className="page-tree__toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-label="하위 페이지 펼치기/접기"
        >
          {hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </button>
        <span className="page-tree__title">{node.page.title}</span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <PageTreeRow key={child.page.id} node={child} depth={depth + 1} activeId={activeId} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  teamName,
  user,
  pages,
  activePageId,
  onOpenPage,
  onCreatePage,
  onNavigate,
  onSearch,
  onLogout,
  className,
}: {
  teamName: string;
  user: UserDTO;
  pages: PageSummaryDTO[];
  activePageId: string | null;
  onOpenPage: (id: string) => void;
  onCreatePage: () => void;
  onNavigate: (path: string) => void;
  onSearch: (q: string) => void;
  onLogout: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const recent = useMemo(
    () => [...pages].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5),
    [pages],
  );

  return (
    <aside className={className ? `sidebar ${className}` : "sidebar"}>
      <div className="sidebar__team">{teamName}</div>
      <input
        className="sidebar__search"
        placeholder="페이지 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) onSearch(query.trim());
        }}
      />

      <button type="button" className="sidebar__new-page" onClick={onCreatePage}>
        + 새 페이지
      </button>

      {recent.length > 0 && (
        <>
          <div className="sidebar__section-label">최근 페이지</div>
          {recent.map((p) => (
            <button key={p.id} type="button" className="sidebar__link" onClick={() => onOpenPage(p.id)}>
              {p.title}
            </button>
          ))}
        </>
      )}

      <div className="sidebar__section-label">페이지</div>
      <div className="page-tree">
        {tree.map((node) => (
          <PageTreeRow key={node.page.id} node={node} depth={0} activeId={activePageId} onOpen={onOpenPage} />
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: "auto" }}>
        <button type="button" className="sidebar__link" onClick={() => onNavigate("/trash")}>
          🗑 휴지통
        </button>
        {user.role === "admin" && (
          <button type="button" className="sidebar__link" onClick={() => onNavigate("/admin")}>
            ⚙ 설정
          </button>
        )}
        <button type="button" className="sidebar__link" onClick={onLogout}>
          {user.name} ({user.role}) · 로그아웃
        </button>
      </div>
    </aside>
  );
}
