import { useMemo, useState, type DragEvent } from "react";
import type { PageSummaryDTO, UserDTO } from "@shared/types";
import { buildPageTree, type PageTreeNode } from "@/hooks/usePages";

function PageTreeRow({
  node,
  depth,
  activeId,
  onOpen,
  canReorder,
  draggedPageId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string | null;
  onOpen: (id: string) => void;
  canReorder: boolean;
  draggedPageId: string | null;
  dropTarget: { pageId: string; position: "before" | "after" } | null;
  onDragStart: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragOver: (event: DragEvent, page: PageSummaryDTO) => void;
  onDrop: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className={[
          "page-tree__row",
          node.page.id === activeId ? "page-tree__row--active" : "",
          node.page.id === draggedPageId ? "page-tree__row--dragging" : "",
          dropTarget?.pageId === node.page.id ? `page-tree__row--drop-${dropTarget.position}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onOpen(node.page.id)}
        onDragOver={(event) => onDragOver(event, node.page)}
        onDrop={(event) => onDrop(event, node.page)}
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
        {node.page.openQuestionCount > 0 && (
          <span className="page-tree__question-badge" title={`미해결 질문 ${node.page.openQuestionCount}개`}>
            ? {node.page.openQuestionCount}
          </span>
        )}
        {canReorder && (
          <span
            className="page-tree__drag-handle"
            draggable
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => onDragStart(event, node.page)}
            onDragEnd={onDragEnd}
            title="위아래로 드래그하여 순서 변경"
            aria-label={`${node.page.title} 순서 변경`}
          >
            ⋮⋮
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <PageTreeRow
              key={child.page.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onOpen={onOpen}
              canReorder={canReorder}
              draggedPageId={draggedPageId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
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
  canReorder,
  onReorderPage,
  onNavigate,
  onSearch,
  className,
}: {
  teamName: string;
  user: UserDTO;
  pages: PageSummaryDTO[];
  activePageId: string | null;
  onOpenPage: (id: string) => void;
  onCreatePage: () => void;
  canReorder: boolean;
  onReorderPage: (pageId: string, orderKey: number) => void;
  onNavigate: (path: string) => void;
  onSearch: (q: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ pageId: string; position: "before" | "after" } | null>(null);
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const recent = useMemo(
    () => [...pages].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5),
    [pages],
  );

  const handleDragStart = (event: DragEvent, page: PageSummaryDTO) => {
    setDraggedPageId(page.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", page.id);
  };

  const handleDragOver = (event: DragEvent, page: PageSummaryDTO) => {
    const dragged = pages.find((candidate) => candidate.id === draggedPageId);
    if (!dragged || dragged.id === page.id || dragged.parentId !== page.parentId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropTarget({ pageId: page.id, position: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
  };

  const handleDrop = (event: DragEvent, target: PageSummaryDTO) => {
    event.preventDefault();
    const dragged = pages.find((candidate) => candidate.id === draggedPageId);
    if (!dragged || dragged.id === target.id || dragged.parentId !== target.parentId || !dropTarget) {
      setDraggedPageId(null);
      setDropTarget(null);
      return;
    }

    const siblings = pages
      .filter((page) => page.parentId === dragged.parentId && page.id !== dragged.id)
      .sort((a, b) => a.orderKey - b.orderKey);
    const targetIndex = siblings.findIndex((page) => page.id === target.id);
    const insertIndex = targetIndex + (dropTarget.position === "after" ? 1 : 0);
    const previous = siblings[insertIndex - 1];
    const next = siblings[insertIndex];
    const orderKey =
      previous && next ? (previous.orderKey + next.orderKey) / 2 : previous ? previous.orderKey + 1 : next ? next.orderKey - 1 : 0;

    onReorderPage(dragged.id, orderKey);
    setDraggedPageId(null);
    setDropTarget(null);
  };

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
          <PageTreeRow
            key={node.page.id}
            node={node}
            depth={0}
            activeId={activePageId}
            onOpen={onOpenPage}
            canReorder={canReorder}
            draggedPageId={draggedPageId}
            dropTarget={dropTarget}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={() => {
              setDraggedPageId(null);
              setDropTarget(null);
            }}
          />
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
      </div>
    </aside>
  );
}
