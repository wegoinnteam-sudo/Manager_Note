import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { PageCategoryDTO, PageDetailDTO, PageSummaryDTO, TeamMemberDTO, UserDTO } from "@shared/types";
import { buildPageTree, type PageTreeNode } from "@/hooks/usePages";
import type { PresenceUser } from "@/hooks/usePresence";
import type { ThemePreference } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { defaultAuthorColor } from "@/lib/authorColors";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "☀️ 라이트" },
  { value: "dark", label: "🌙 다크" },
  { value: "gray", label: "◉ 회색" },
];

const FAVORITES_KEY = "th_sidebar_favorites";
const OFFLINE_KEY_PREFIX = "th_offline_page_";
const WIKI_KEY = "th_wiki_pages";

function readStoredIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function PageTreeRow({
  node,
  depth,
  activeId,
  selectedIds,
  onOpen,
  onExtendSelection,
  canReorder,
  draggedPageId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  viewersByPage,
  onContextMenu,
  editingPageId,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string | null;
  selectedIds: Set<string>;
  onOpen: (event: React.MouseEvent, id: string) => void;
  onExtendSelection: (id: string, direction: -1 | 1) => void;
  canReorder: boolean;
  draggedPageId: string | null;
  dropTarget: { pageId: string; position: "before" | "after" | "inside" } | null;
  onDragStart: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragOver: (event: DragEvent, page: PageSummaryDTO) => void;
  onDrop: (event: DragEvent, page: PageSummaryDTO) => void;
  onDragEnd: () => void;
  viewersByPage: Map<string, PresenceUser[]>;
  onContextMenu: (event: React.MouseEvent, page: PageSummaryDTO) => void;
  editingPageId: string | null;
  onStartRename: (page: PageSummaryDTO) => void;
  onCommitRename: (page: PageSummaryDTO, title: string) => void;
  onCancelRename: () => void;
}) {
  const viewers = viewersByPage.get(node.page.id) ?? [];
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isEditing = node.page.id === editingPageId;
  const cancelledRef = useRef(false);
  return (
    <div>
      <div
        className={[
          "page-tree__row",
          node.page.id === activeId ? "page-tree__row--active" : "",
          selectedIds.has(node.page.id) ? "page-tree__row--selected" : "",
          node.page.id === draggedPageId ? "page-tree__row--dragging" : "",
          dropTarget?.pageId === node.page.id ? `page-tree__row--drop-${dropTarget.position}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 8 + depth * 14 }}
        data-page-id={node.page.id}
        tabIndex={0}
        onClick={(event) => onOpen(event, node.page.id)}
        onKeyDown={(event) => {
          if (event.key === "F2" && !isEditing) {
            event.preventDefault();
            onStartRename(node.page);
          } else if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            onExtendSelection(node.page.id, event.key === "ArrowUp" ? -1 : 1);
          }
        }}
        onDragOver={(event) => onDragOver(event, node.page)}
        onDrop={(event) => onDrop(event, node.page)}
        onContextMenu={(event) => onContextMenu(event, node.page)}
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
        {isEditing ? (
          <input
            className="page-tree__title-input"
            autoFocus
            defaultValue={node.page.title}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelledRef.current = true;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              if (cancelledRef.current) {
                cancelledRef.current = false;
                onCancelRename();
              } else {
                onCommitRename(node.page, event.currentTarget.value);
              }
            }}
          />
        ) : (
          <span
            className={depth === 0 ? "page-tree__title page-tree__title--root" : "page-tree__title"}
            style={{
              color: node.page.textColor ?? undefined,
              backgroundColor: node.page.highlightColor ?? undefined,
            }}
          >
            {node.page.title}
          </span>
        )}
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
              selectedIds={selectedIds}
              onOpen={onOpen}
              onExtendSelection={onExtendSelection}
              canReorder={canReorder}
              draggedPageId={draggedPageId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              viewersByPage={viewersByPage}
              onContextMenu={onContextMenu}
              editingPageId={editingPageId}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
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
  categories,
  activePageId,
  onOpenPage,
  onCreatePage,
  canReorder,
  onReorderPage,
  onNavigate,
  onSearch,
  className,
  presenceUsers,
  onPagesChanged,
  members,
  onMyColorChanged,
  theme,
  onThemeChange,
}: {
  teamName: string;
  user: UserDTO;
  pages: PageSummaryDTO[];
  categories: PageCategoryDTO[];
  activePageId: string | null;
  onOpenPage: (id: string) => void;
  onCreatePage: () => void;
  canReorder: boolean;
  onReorderPage: (pageId: string, orderKey: number, parentId?: string | null) => void;
  onNavigate: (path: string) => void;
  onSearch: (q: string) => void;
  className?: string;
  presenceUsers: PresenceUser[];
  onPagesChanged: () => void;
  members: TeamMemberDTO[];
  onMyColorChanged: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  const [query, setQuery] = useState("");
  const [colorSaving, setColorSaving] = useState(false);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ pageId: string; position: "before" | "after" | "inside" } | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredIds(FAVORITES_KEY));
  const [offlineIds, setOfflineIds] = useState<string[]>(() =>
    pages.filter((page) => localStorage.getItem(`${OFFLINE_KEY_PREFIX}${page.id}`)).map((page) => page.id),
  );
  const [wikiIds, setWikiIds] = useState<string[]>(() => readStoredIds(WIKI_KEY));
  const [contextMenu, setContextMenu] = useState<{ page: PageSummaryDTO; x: number; y: number } | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [sidePreview, setSidePreview] = useState<PageDetailDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorRef = useRef<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const tree = useMemo(() => buildPageTree(pages), [pages]);
  const categoryTrees = useMemo(
    () =>
      categories.map((category) => ({
        category,
        nodes: tree.filter((node) => node.page.category === category.key),
      })),
    [categories, tree],
  );
  const uncategorizedTree = useMemo(
    () => tree.filter((node) => !node.page.category || !categories.some((category) => category.key === node.page.category)),
    [categories, tree],
  );
  const pageOrder = useMemo(() => {
    const ids: string[] = [];
    const visit = (nodes: PageTreeNode[]) => {
      for (const node of nodes) {
        ids.push(node.page.id);
        visit(node.children);
      }
    };
    for (const group of categoryTrees) visit(group.nodes);
    visit(uncategorizedTree);
    return ids;
  }, [categoryTrees, uncategorizedTree]);
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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  useEffect(() => {
    const validIds = new Set(pages.filter((page) => !page.isDeleted).map((page) => page.id));
    setSelectedPageIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [pages]);

  useEffect(() => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      categories.forEach((category) => next.add(category.key));
      return next;
    });
  }, [categories]);

  const openOrSelectPage = useCallback(
    (event: React.MouseEvent, pageId: string) => {
      if (event.shiftKey && selectionAnchorRef.current) {
        event.preventDefault();
        const anchorIndex = pageOrder.indexOf(selectionAnchorRef.current);
        const pageIndex = pageOrder.indexOf(pageId);
        if (anchorIndex !== -1 && pageIndex !== -1) {
          const start = Math.min(anchorIndex, pageIndex);
          const end = Math.max(anchorIndex, pageIndex);
          setSelectedPageIds(new Set(pageOrder.slice(start, end + 1)));
          return;
        }
      }

      selectionAnchorRef.current = pageId;
      setSelectedPageIds(new Set([pageId]));
      onOpenPage(pageId);
    },
    [onOpenPage, pageOrder],
  );

  const extendPageSelection = useCallback(
    (pageId: string, direction: -1 | 1) => {
      const pageIndex = pageOrder.indexOf(pageId);
      const targetId = pageOrder[pageIndex + direction];
      if (pageIndex === -1 || !targetId) return;

      const anchorId = selectionAnchorRef.current ?? pageId;
      selectionAnchorRef.current = anchorId;
      const anchorIndex = pageOrder.indexOf(anchorId);
      const targetIndex = pageOrder.indexOf(targetId);
      setSelectedPageIds(new Set(pageOrder.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)));
      requestAnimationFrame(() => {
        const rows = sidebarRef.current?.querySelectorAll<HTMLElement>("[data-page-id]");
        [...(rows ?? [])].find((row) => row.dataset.pageId === targetId)?.focus();
      });
    },
    [pageOrder],
  );

  useEffect(() => {
    const handleDelete = async (event: KeyboardEvent) => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || selectedPageIds.size === 0 || busy) return;
      if (!sidebarRef.current?.contains(document.activeElement)) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      const selected = pages.filter((page) => selectedPageIds.has(page.id));
      if (selected.length === 0) return;
      if (!window.confirm(`선택한 ${selected.length}개 페이지를 휴지통으로 이동할까요?`)) return;

      setBusy(true);
      try {
        await Promise.all(selected.map((page) => api.deletePage(page.id)));
        setSelectedPageIds(new Set());
        selectionAnchorRef.current = null;
        await onPagesChanged();
        if (activePageId && selectedPageIds.has(activePageId)) onNavigate("/");
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [activePageId, busy, onNavigate, onPagesChanged, pages, selectedPageIds]);

  const saveIds = (key: string, ids: string[], setter: (value: string[]) => void) => {
    localStorage.setItem(key, JSON.stringify(ids));
    setter(ids);
  };

  const toggleFavorite = (pageId: string) => {
    const next = favorites.includes(pageId) ? favorites.filter((id) => id !== pageId) : [...favorites, pageId];
    saveIds(FAVORITES_KEY, next, setFavorites);
  };

  const myColor = members.find((m) => m.id === user.id)?.color ?? null;

  const changeMyColor = async (color: string | null) => {
    setColorSaving(true);
    try {
      await api.updateMyColor(color);
      onMyColorChanged();
    } finally {
      setColorSaving(false);
    }
  };

  const toggleOffline = async (page: PageSummaryDTO) => {
    const key = `${OFFLINE_KEY_PREFIX}${page.id}`;
    if (offlineIds.includes(page.id)) {
      localStorage.removeItem(key);
      setOfflineIds((ids) => ids.filter((id) => id !== page.id));
      return;
    }
    const detail = await api.getPage(page.id);
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), page: detail }));
    setOfflineIds((ids) => [...ids, page.id]);
  };

  const duplicatePage = async (page: PageSummaryDTO) => {
    const source = await api.getPage(page.id);
    let copy = await api.createPage({ parentId: page.parentId, title: `${page.title} 복사본` });
    copy = await api.updatePageMeta(copy.id, {
      expectedVersion: copy.version,
      status: source.status,
      assigneeId: source.assigneeId,
      dueDate: source.dueDate,
      tags: source.tags,
    });
    await api.updatePageContent(copy.id, copy.contentVersion, source.contentJson);
    await onPagesChanged();
    onOpenPage(copy.id);
  };

  const commitRename = async (page: PageSummaryDTO, rawTitle: string) => {
    setEditingPageId(null);
    const title = rawTitle.trim();
    if (!title || title === page.title) return;
    await api.updatePageMeta(page.id, { expectedVersion: page.version, title });
    await onPagesChanged();
  };

  const renamePage = async (page: PageSummaryDTO) => {
    const title = window.prompt("새 페이지 이름", page.title)?.trim();
    if (!title || title === page.title) return;
    await api.updatePageMeta(page.id, { expectedVersion: page.version, title });
    await onPagesChanged();
  };

  const setPageColor = async (
    page: PageSummaryDTO,
    patch: { textColor?: string | null; highlightColor?: string | null },
  ) => {
    const updated = await api.updatePageMeta(page.id, { expectedVersion: page.version, ...patch });
    await onPagesChanged();
    setContextMenu((prev) =>
      prev && prev.page.id === page.id
        ? { ...prev, page: { ...prev.page, textColor: updated.textColor, highlightColor: updated.highlightColor, version: updated.version } }
        : prev,
    );
  };

  const movePage = async (page: PageSummaryDTO, parentId: string | null) => {
    await api.updatePageMeta(page.id, { expectedVersion: page.version, parentId });
    setMoving(false);
    setContextMenu(null);
    await onPagesChanged();
  };

  const trashPage = async (page: PageSummaryDTO) => {
    if (!window.confirm(`"${page.title}" 페이지를 휴지통으로 이동할까요?`)) return;
    await api.deletePage(page.id);
    setContextMenu(null);
    await onPagesChanged();
    if (activePageId === page.id) onNavigate("/");
  };

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const favoritePages = favorites.map((id) => pages.find((page) => page.id === id)).filter((page): page is PageSummaryDTO => !!page && !page.isDeleted);

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
    <aside ref={sidebarRef} className={className ? `sidebar ${className}` : "sidebar"}>
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

      <button type="button" className="sidebar__link sidebar__link--wdb" onClick={() => onNavigate("/db")}>
        🗂 Wegoinn DB
      </button>

      <button type="button" className="sidebar__new-page" onClick={onCreatePage}>
        + 새 페이지
      </button>

      {favoritePages.length > 0 && (
        <>
          <div className="sidebar__section-label">즐겨찾기</div>
          {favoritePages.map((page) => (
            <button key={page.id} type="button" className="sidebar__link sidebar__favorite" onClick={() => onOpenPage(page.id)} onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ page, x: event.clientX, y: event.clientY });
            }}>
              <span>★</span>
              <span>{page.title}</span>
            </button>
          ))}
        </>
      )}

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
        {categories.length > 0 && (
          <button type="button" className="page-tree__collapse-all" onClick={() => setExpandedCategories(new Set())}>
            모두 접기
          </button>
        )}
        {categoryTrees.map(({ category, nodes }) => (
          <div key={category.key} className="page-tree__category">
            <button
              type="button"
              className="page-tree__category-row"
              onClick={() =>
                setExpandedCategories((current) => {
                  const next = new Set(current);
                  if (next.has(category.key)) next.delete(category.key);
                  else next.add(category.key);
                  return next;
                })
              }
            >
              <span>{expandedCategories.has(category.key) ? "▾" : "▸"}</span>
              <span className="page-tree__category-dot" style={{ background: category.color }} />
              <strong>{category.label}</strong>
              <span className="page-tree__category-count">{nodes.length}</span>
            </button>
            {expandedCategories.has(category.key) &&
              nodes.map((node) => (
                <PageTreeRow
                  key={node.page.id}
                  node={node}
                  depth={1}
                  activeId={activePageId}
                  selectedIds={selectedPageIds}
                  onOpen={openOrSelectPage}
                  onExtendSelection={extendPageSelection}
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
                  onContextMenu={(event, page) => {
                    event.preventDefault();
                    setMoving(false);
                    setContextMenu({ page, x: event.clientX, y: event.clientY });
                  }}
                  editingPageId={editingPageId}
                  onStartRename={(page) => setEditingPageId(page.id)}
                  onCommitRename={commitRename}
                  onCancelRename={() => setEditingPageId(null)}
                />
              ))}
          </div>
        ))}
        {uncategorizedTree.map((node) => (
          <PageTreeRow
            key={node.page.id}
            node={node}
            depth={0}
            activeId={activePageId}
            selectedIds={selectedPageIds}
            onOpen={openOrSelectPage}
            onExtendSelection={extendPageSelection}
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
            onContextMenu={(event, page) => {
              event.preventDefault();
              setMoving(false);
              setContextMenu({ page, x: event.clientX, y: event.clientY });
            }}
            editingPageId={editingPageId}
            onStartRename={(page) => setEditingPageId(page.id)}
            onCommitRename={commitRename}
            onCancelRename={() => setEditingPageId(null)}
          />
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: "auto" }}>
        <div className="sidebar__my-color">
          <span>내 캘린더 색상</span>
          <input
            type="color"
            value={myColor ?? defaultAuthorColor(user.id)}
            disabled={colorSaving}
            onChange={(e) => changeMyColor(e.target.value)}
            title="캘린더 일정 색상 (내가 만든 일정에 적용됩니다)"
          />
          {myColor && (
            <button type="button" onClick={() => changeMyColor(null)} disabled={colorSaving} title="기본 색상으로 되돌리기">
              기본값
            </button>
          )}
        </div>
        <div className="sidebar__theme-switch" role="radiogroup" aria-label="화면 테마">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className={theme === option.value ? "sidebar__theme-btn sidebar__theme-btn--active" : "sidebar__theme-btn"}
              onClick={() => onThemeChange(option.value)}
              title={`${option.label} 모드 (이 기기에만 저장됨)`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="sidebar__link" onClick={() => onNavigate("/trash")}>
          🗑 휴지통
        </button>
        <button type="button" className="sidebar__link" onClick={() => onNavigate("/admin")}>
          ⚙ 설정
        </button>
      </div>

      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.min(contextMenu.y, window.innerHeight - 520) }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sidebar-context-menu__title">
            <span>{wikiIds.includes(contextMenu.page.id) ? "📚" : "📄"}</span>
            <span>{contextMenu.page.title}</span>
          </div>
          <button type="button" onClick={() => { toggleFavorite(contextMenu.page.id); setContextMenu(null); }}>
            {favorites.includes(contextMenu.page.id) ? "★ 즐겨찾기에서 제거" : "☆ 즐겨찾기에 추가"}
          </button>
          <button type="button" onClick={() => runAction(async () => { await toggleOffline(contextMenu.page); setContextMenu(null); })}>
            {offlineIds.includes(contextMenu.page.id) ? "✓ 오프라인 저장 해제" : "↓ 오프라인에서 사용 가능"}
          </button>
          <button type="button" onClick={() => runAction(async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/page/${contextMenu.page.id}`);
            setContextMenu(null);
          })}>🔗 링크 복사</button>
          <button type="button" onClick={() => runAction(() => duplicatePage(contextMenu.page))}>⧉ 복제</button>
          <button type="button" onClick={() => runAction(() => renamePage(contextMenu.page))}>✎ 이름 바꾸기</button>
          <div className="sidebar-context-menu__colors">
            <label>
              <span>글자색</span>
              <input
                type="color"
                value={contextMenu.page.textColor ?? "#1f1f1f"}
                onChange={(event) => runAction(() => setPageColor(contextMenu.page, { textColor: event.target.value }))}
              />
            </label>
            {contextMenu.page.textColor && (
              <button
                type="button"
                className="sidebar-context-menu__color-clear"
                onClick={() => runAction(() => setPageColor(contextMenu.page, { textColor: null }))}
              >
                초기화
              </button>
            )}
          </div>
          <div className="sidebar-context-menu__colors">
            <label>
              <span>형광펜</span>
              <input
                type="color"
                value={contextMenu.page.highlightColor ?? "#ffffff"}
                onChange={(event) => runAction(() => setPageColor(contextMenu.page, { highlightColor: event.target.value }))}
              />
            </label>
            {contextMenu.page.highlightColor && (
              <button
                type="button"
                className="sidebar-context-menu__color-clear"
                onClick={() => runAction(() => setPageColor(contextMenu.page, { highlightColor: null }))}
              >
                초기화
              </button>
            )}
          </div>
          <button type="button" onClick={() => setMoving((value) => !value)}>↪ 옮기기</button>
          {moving && (
            <div className="sidebar-context-menu__move">
              <button type="button" onClick={() => runAction(() => movePage(contextMenu.page, null))}>최상위로 이동</button>
              {pages.filter((page) => !page.isDeleted && !wouldCreateCycle(contextMenu.page.id, page.id)).map((page) => (
                <button key={page.id} type="button" onClick={() => runAction(() => movePage(contextMenu.page, page.id))}>{page.title} 아래로</button>
              ))}
            </div>
          )}
          <button type="button" className="sidebar-context-menu__danger" onClick={() => runAction(() => trashPage(contextMenu.page))}>🗑 휴지통으로 이동</button>
          <button type="button" onClick={() => {
            const next = wikiIds.includes(contextMenu.page.id) ? wikiIds.filter((id) => id !== contextMenu.page.id) : [...wikiIds, contextMenu.page.id];
            saveIds(WIKI_KEY, next, setWikiIds);
            setContextMenu(null);
          }}>{wikiIds.includes(contextMenu.page.id) ? "📄 일반 페이지로 전환" : "📚 위키로 전환"}</button>
          <div className="sidebar-context-menu__separator" />
          <button type="button" onClick={() => window.open(`/page/${contextMenu.page.id}`, "_blank", "noopener")}>↗ 새 탭에서 열기</button>
          <button type="button" onClick={() => window.open(`/page/${contextMenu.page.id}`, "_blank", "popup=yes,width=1200,height=850")}>▣ 새 창에서 열기</button>
          <button type="button" onClick={() => runAction(async () => {
            setSidePreview(await api.getPage(contextMenu.page.id));
            setContextMenu(null);
          })}>▥ 사이드 보기에서 열기</button>
          <div className="sidebar-context-menu__meta">
            마지막 편집{" "}
            {members.find((member) => member.id === contextMenu.page.updatedBy)?.name ?? "알 수 없음"} ·{" "}
            {new Date(contextMenu.page.updatedAt).toLocaleString("ko-KR")}
          </div>
          {busy && <div className="sidebar-context-menu__busy">처리 중…</div>}
        </div>
      )}

      {sidePreview && (
        <aside className="sidebar-page-preview">
          <div className="sidebar-page-preview__header">
            <strong>{sidePreview.title}</strong>
            <div>
              <button type="button" onClick={() => onOpenPage(sidePreview.id)}>전체 페이지</button>
              <button type="button" onClick={() => setSidePreview(null)} aria-label="닫기">×</button>
            </div>
          </div>
          <div className="sidebar-page-preview__properties">
            <span>상태: {sidePreview.status}</span>
            {sidePreview.dueDate && <span>마감일: {sidePreview.dueDate}</span>}
          </div>
          <div className="sidebar-page-preview__content">
            {sidePreview.contentJson.blocks.map((block) =>
              "text" in block ? <p key={block.id}>{block.text || " "}</p> : block.type === "image" ? <p key={block.id}>🖼 이미지</p> : null,
            )}
          </div>
        </aside>
      )}
    </aside>
  );
}
