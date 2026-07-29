import { useMemo, useState, type DragEvent } from "react";
import type { PageSummaryDTO, UserDTO } from "@shared/types";
import { buildPageTree, type PageTreeNode } from "@/hooks/usePages";
import type { PresenceUser } from "@/hooks/usePresence";

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
  viewersByPage,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string | null;
  onOpen: (id: string) => void;
  canReorder: boolean;
  draggedPageId: string | null;
  dropTarget: { pageId: string; position: "before" | "after" | "inside" } | null;
  onDragStart: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragOver: (event: DragEvent, page: PageSummaryDTO) => void;
  onDrop: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragEnd: () => void;
  viewersByPage: Map<string, PresenceUser[]>;
}) {
  const viewers = viewersByPage.get(node.page.id) ?? [];
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
        {viewers.length > 0 && (
          <span className="page-tree__viewers" title={viewers.map((v) => v.name).join(", ")}>
            {viewers.slice(0, 3).map((v) => (
              <span key={v.clientId} className="page-tree__viewer-animal" style={{ borderColor: v.color }}>
                {v.animal}
              </span>
            ))}
          </span>
        )}
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
              viewersByPage={viewersByPage}
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
  presenceUsers,
}: {
  teamName: string;
  user: UserDTO;
  pages: PageSummaryDTO[];
  activePageId: string | null;
  onOpenPage: (id: string) => void;
  onCreatePage: () => void;
  canReorder: boolean;
  onReorderPage: (pageId: string, orderKey: number, parentId?: string | null) => void;
  onNavigate: (path: string) => void;
  onSearch: (q: string) => void;
  className?: string;
  presenceUsers: PresenceUser[];
}) {
  const [query, setQuery] = useState("");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ pageId: string; position: "before" | "after" | "inside" } | null>(null);
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const recent = useMemo(
    () => [...pages].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5),
    [pages],
  );
  const viewersByPage = useMemo(() => {
    const map = new Map<string, PresenceUser[]>();
    for (const u of presenceUsers) {
      if (!u.pageId) continue;
      const list = map.get(u.pageId) ?? [];
      list.push(u);
      map.set(u.pageId, list);
    }
    return map;
  }, [presenceUsers]);

  const handleDragStart = (event: DragEvent, page: PageSummaryDTO) => {
    setDraggedPageId(page.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", page.id);
  };

  // Would placing `draggedId` under `newParentId` make a page its own ancestor?
  const wouldCreateCycle = (draggedId: string, newParentId: string | null): boolean => {
    if (newParentId === null) return false;
    if (newParentId === draggedId) return true;
    let current = pages.find((p) => p.id === newParentId);
    while (current) {
      if (current.id === draggedId) return true;
      if (!current.parentId) return false;
      current = pages.find((p) => p.id === current!.parentId);
    }
    return false;
  };

  const handleDragOver = (event: DragEvent, page: PageSummaryDTO) => {
    const dragged = pages.find((candidate) => candidate.id === draggedPageId);
    if (!dragged || dragged.id === page.id) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const position: "before" | "after" | "inside" = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
    const resultingParentId = position === "inside" ? page.id : page.parentId;
    if (wouldCreateCycle(dragged.id, resultingParentId)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ pageId: page.id, position });
  };

  const handleDrop = (event: DragEvent, target: PageSummaryDTO) => {
    event.preventDefault();
    const dragged = pages.find((candidate) => candidate.id === draggedPageId);
    if (!dragged || !dropTarget || dropTarget.pageId !== target.id) {
      setDraggedPageId(null);
      setDropTarget(null);
      return;
    }

    const newParentId = dropTarget.position === "inside" ? target.id : target.parentId;
    const siblings = pages
      .filter((page) => page.parentId === newParentId && page.id !== dragged.id)
      .sort((a, b) => a.orderKey - b.orderKey);
    const insertIndex =
      dropTarget.position === "inside"
        ? siblings.length
        : siblings.findIndex((page) => page.id === target.id) + (dropTarget.position === "after" ? 1 : 0);
    const previous = siblings[insertIndex - 1];
    const next = siblings[insertIndex];
    const orderKey =
      previous && next ? (previous.orderKey + next.orderKey) / 2 : previous ? previous.orderKey + 1 : next ? next.orderKey - 1 : 0;

    onReorderPage(dragged.id, orderKey, newParentId === dragged.parentId ? undefined : newParentId);
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
            viewersByPage={viewersByPage}
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
