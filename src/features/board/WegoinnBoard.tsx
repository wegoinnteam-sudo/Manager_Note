import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { PageCategory, PageCategoryDTO, PageSummaryDTO, TeamMemberDTO, UserDTO } from "@shared/types";
import {
  DEFAULT_TAG_COLOR,
  TAG_COLORS,
  UNCATEGORIZED_COLOR,
  UNCATEGORIZED_LABEL,
} from "@shared/types";
import { api } from "@/lib/api";
import { memberName } from "@/hooks/useTeamMembers";

type ViewMode = "board" | "list";
type CategoryFilter = PageCategory | "all" | "none";
type SortField = "title" | "category" | "date" | "updatedAt";

function readQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: (params.get("view") === "list" ? "list" : "board") as ViewMode,
    q: params.get("q") ?? "",
    category: (params.get("category") as CategoryFilter | null) ?? "all",
    tag: params.get("tag") ?? "",
  };
}

function formatKoreanDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(d);
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="wdb-highlight">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="wdb-tags">
      {tags.map((tag) => {
        const color = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR;
        return (
          <span key={tag} className="wdb-tag" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
            {tag}
          </span>
        );
      })}
    </div>
  );
}

function CategoryBadge({ category, categories }: { category: PageCategory | null; categories: PageCategoryDTO[] }) {
  const definition = categories.find((item) => item.key === category);
  const label = definition?.label ?? (category || UNCATEGORIZED_LABEL);
  const color = definition?.color ?? UNCATEGORIZED_COLOR;
  return (
    <span className="wdb-category-badge" style={{ color, background: `${color}1f` }}>
      {label}
    </span>
  );
}

export function WegoinnBoard({
  pages,
  members,
  canEdit,
  categories,
  onCategoriesChanged,
  onOpenPage,
  onPagesChanged,
  onNavigate,
}: {
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
  user: UserDTO;
  canEdit: boolean;
  categories: PageCategoryDTO[];
  onCategoriesChanged: () => Promise<void> | void;
  onOpenPage: (id: string) => void;
  onPagesChanged: () => Promise<void> | void;
  onNavigate: (path: string) => void;
}) {
  const initial = useMemo(readQueryParams, []);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [query, setQuery] = useState(initial.q);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(initial.category);
  const [tagFilter, setTagFilter] = useState(initial.tag);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "title", dir: "asc" });
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ created: number; skipped: number } | null>(null);
  const [contentSeeding, setContentSeeding] = useState(false);
  const [contentSeedResult, setContentSeedResult] = useState<{ pagesCreated: number; contentFilled: number } | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#2563eb");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [draggedCategoryKey, setDraggedCategoryKey] = useState<string | null>(null);
  const [dragOverCategoryKey, setDragOverCategoryKey] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "board") params.set("view", view);
    if (query) params.set("q", query);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (tagFilter) params.set("tag", tagFilter);
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `/db?${qs}` : "/db");
  }, [view, query, categoryFilter, tagFilter]);

  const roots = useMemo(() => pages.filter((p) => !p.isDeleted && !p.parentId), [pages]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    roots.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [roots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roots.filter((p) => {
      if (categoryFilter === "none" && p.category) return false;
      if (categoryFilter !== "all" && categoryFilter !== "none" && p.category !== categoryFilter) return false;
      if (tagFilter && !p.tags.includes(tagFilter)) return false;
      if (q && !p.title.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roots, categoryFilter, tagFilter, query]);

  const columns = useMemo(() => {
    const cols: { key: PageCategory | null; label: string; color: string; items: PageSummaryDTO[] }[] = categories.map((category) => ({
      key: category.key,
      label: category.label,
      color: category.color,
      items: filtered.filter((p) => p.category === category.key).sort((a, b) => a.orderKey - b.orderKey),
    }));
    cols.push({
      key: null,
      label: UNCATEGORIZED_LABEL,
      color: UNCATEGORIZED_COLOR,
      items: filtered.filter((p) => !p.category).sort((a, b) => a.orderKey - b.orderKey),
    });
    return cols;
  }, [categories, filtered]);

  const sortedList = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const value = (p: PageSummaryDTO): string => {
      switch (sort.field) {
        case "title":
          return p.title;
        case "category":
          return categories.find((category) => category.key === p.category)?.label ?? p.category ?? UNCATEGORIZED_LABEL;
        case "date":
          return p.dueDate ?? "";
        case "updatedAt":
          return p.updatedAt;
        default:
          return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [categories, filtered, sort]);

  const createCategory = async () => {
    const label = newCategoryName.trim();
    if (!label || categoryBusy) return;
    setCategoryBusy(true);
    try {
      const created = await api.createPageCategory(label, newCategoryColor);
      await onCategoriesChanged();
      setCategoryFilter(created.key);
      setNewCategoryName("");
      setAddingCategory(false);
    } finally {
      setCategoryBusy(false);
    }
  };

  const deleteCategory = async (key: string) => {
    const target = categories.find((c) => c.key === key);
    if (!target) return;
    if (!window.confirm(`"${target.label}" 카테고리를 삭제할까요? 이 카테고리의 자료는 카테고리 없음으로 이동합니다.`)) return;
    await api.deletePageCategory(key);
    if (categoryFilter === key) setCategoryFilter("all");
    await onCategoriesChanged();
    await onPagesChanged();
  };

  const reorderCategories = async (draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey) return;
    const order = categories.map((c) => c.key);
    const from = order.indexOf(draggedKey);
    const to = order.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedKey);
    await api.reorderPageCategories(order);
    await onCategoriesChanged();
  };

  const createInCategory = async (category: PageCategory | null) => {
    const page = await api.createPage({ parentId: null, category });
    await onPagesChanged();
    onOpenPage(page.id);
  };

  const moveCard = async (page: PageSummaryDTO, category: PageCategory | null, beforeId: string | null) => {
    if (page.category === category && beforeId === page.id) return;
    const column = columns.find((c) => c.key === category);
    const siblings = (column?.items ?? []).filter((p) => p.id !== page.id);
    const idx = beforeId ? siblings.findIndex((p) => p.id === beforeId) : siblings.length;
    const prev = siblings[idx - 1];
    const next = siblings[idx];
    const orderKey = prev && next ? (prev.orderKey + next.orderKey) / 2 : prev ? prev.orderKey + 1 : next ? next.orderKey - 1 : 0;

    const detail = await api.getPage(page.id);
    await api.updatePageMeta(page.id, { expectedVersion: detail.version, category, orderKey });
    await onPagesChanged();
  };

  const runSeed = async () => {
    setSeeding(true);
    try {
      const result = await api.adminSeedWegoinnDb();
      setSeedResult({ created: result.created.length, skipped: result.skipped.length });
      await onPagesChanged();
    } finally {
      setSeeding(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSetCategory = async (category: PageCategory | null) => {
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      const page = pages.find((p) => p.id === id);
      if (!page) continue;
      const detail = await api.getPage(id);
      await api.updatePageMeta(id, { expectedVersion: detail.version, category });
    }
    await onPagesChanged();
  };

  const bulkArchive = async () => {
    if (!window.confirm(`선택한 ${selected.size}개 자료를 휴지통으로 이동할까요?`)) return;
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      await api.deletePage(id);
    }
    await onPagesChanged();
  };

  const runContentSeed = async () => {
    setContentSeeding(true);
    try {
      const result = await api.adminSeedWegoinnDbContent();
      setContentSeedResult(result);
      await onPagesChanged();
    } finally {
      setContentSeeding(false);
    }
  };

  const toggleSort = (field: SortField) => {
    setSort((current) => (current.field === field ? { field, dir: current.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }));
  };

  return (
    <div className="wdb">
      <div className="wdb__admin-tools">
        <button type="button" disabled={seeding} onClick={runSeed}>
          {seeding ? "만드는 중…" : "초기 자료 만들기"}
        </button>
        <button type="button" disabled={contentSeeding} onClick={runContentSeed}>
          {contentSeeding ? "채우는 중…" : "하위 페이지·본문 내용 채우기"}
        </button>
        <button type="button" onClick={() => onNavigate("/admin")}>
          ⚙ 설정
        </button>
        {seedResult && (
          <span className="wdb__admin-tools-result">
            자료 {seedResult.created}개 생성, {seedResult.skipped}개 건너뜀
          </span>
        )}
        {contentSeedResult && (
          <span className="wdb__admin-tools-result">
            하위 페이지 {contentSeedResult.pagesCreated}개 생성, 본문 {contentSeedResult.contentFilled}개 채움
          </span>
        )}
      </div>
      <div className="wdb__header">
        <h2 className="wdb__title">🗂 Wegoinn DB</h2>
        <div className="wdb__tabs" role="tablist" aria-label="보기 전환">
          <button type="button" className={view === "board" ? "wdb__tab wdb__tab--active" : "wdb__tab"} onClick={() => setView("board")}>
            전체 보드
          </button>
          <button type="button" className={view === "list" ? "wdb__tab wdb__tab--active" : "wdb__tab"} onClick={() => setView("list")}>
            전체 목록
          </button>
        </div>
        <input
          className="wdb__search"
          type="search"
          placeholder="자료명, 설명 검색"
          aria-label="Wegoinn DB 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="wdb__filter" aria-label="카테고리 필터" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}>
          <option value="all">전체 카테고리</option>
          {categories.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
          <option value="none">{UNCATEGORIZED_LABEL}</option>
        </select>
        {allTags.length > 0 && (
          <select className="wdb__filter" aria-label="태그 필터" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">전체 태그</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <>
            <button type="button" className="wdb__add-db-btn" onClick={() => setAddingCategory(true)}>
              + DB 추가
            </button>
            <button
              type="button"
              className="wdb__new-btn"
              onClick={() => createInCategory(categoryFilter !== "all" && categoryFilter !== "none" ? categoryFilter : null)}
            >
              + 새 자료
            </button>
          </>
        )}
      </div>

      {addingCategory && (
        <div className="wdb-category-create" role="dialog" aria-label="DB 대분류 추가">
          <strong>새 DB 대분류</strong>
          <input
            autoFocus
            value={newCategoryName}
            maxLength={60}
            placeholder="대분류 이름"
            onChange={(event) => setNewCategoryName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createCategory();
              if (event.key === "Escape") setAddingCategory(false);
            }}
          />
          <input type="color" aria-label="대분류 색상" value={newCategoryColor} onChange={(event) => setNewCategoryColor(event.target.value)} />
          <button type="button" disabled={!newCategoryName.trim() || categoryBusy} onClick={() => void createCategory()}>
            {categoryBusy ? "추가 중…" : "추가"}
          </button>
          <button type="button" onClick={() => setAddingCategory(false)}>취소</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="wdb__bulkbar">
          <span>{selected.size}개 선택됨</span>
          <select
            aria-label="카테고리 일괄 변경"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) bulkSetCategory(v === "none" ? null : (v as PageCategory));
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              카테고리로 이동…
            </option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
            <option value="none">{UNCATEGORIZED_LABEL}</option>
          </select>
          <button type="button" onClick={bulkArchive}>
            보관(휴지통으로)
          </button>
          <button type="button" onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
        </div>
      )}

      {roots.length === 0 ? (
        <div className="wdb__empty">
          <p>아직 등록된 자료가 없습니다.</p>
          <p>위쪽 도구에서 초기 자료를 만들어보세요.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="wdb__empty">
          <p>조건에 맞는 자료가 없습니다.</p>
        </div>
      ) : view === "board" ? (
        <div className="wdb-board">
          {columns.map((col) => (
            <div
              key={col.key ?? "none"}
              className="wdb-board__col"
              onDragOver={(event: DragEvent) => {
                if (draggedId) event.preventDefault();
              }}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                const page = filtered.find((p) => p.id === draggedId);
                if (page) moveCard(page, col.key, dropBeforeId);
                setDraggedId(null);
                setDropBeforeId(null);
              }}
            >
              <div
                className={
                  dragOverCategoryKey === col.key ? "wdb-board__col-title wdb-board__col-title--drop" : "wdb-board__col-title"
                }
                draggable={canEdit && col.key !== null}
                onDragStart={(event: DragEvent) => {
                  if (!col.key) return;
                  event.stopPropagation();
                  setDraggedCategoryKey(col.key);
                }}
                onDragOver={(event: DragEvent) => {
                  if (!draggedCategoryKey || !col.key || draggedCategoryKey === col.key) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOverCategoryKey(col.key);
                }}
                onDrop={(event: DragEvent) => {
                  if (!draggedCategoryKey || !col.key) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void reorderCategories(draggedCategoryKey, col.key);
                  setDraggedCategoryKey(null);
                  setDragOverCategoryKey(null);
                }}
                onDragEnd={() => {
                  setDraggedCategoryKey(null);
                  setDragOverCategoryKey(null);
                }}
              >
                <span className="wdb-board__col-dot" style={{ background: col.color }} />
                {col.label}
                <span className="wdb-board__col-count">{col.items.length}</span>
                {canEdit && col.key !== null && (
                  <button
                    type="button"
                    className="wdb-board__col-delete"
                    title="카테고리 삭제"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteCategory(col.key!);
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
              {col.items.map((page) => (
                <div
                  key={page.id}
                  className={page.id === draggedId ? "wdb-card wdb-card--dragging" : "wdb-card"}
                  draggable={canEdit}
                  onDragStart={() => setDraggedId(page.id)}
                  onDragOver={(event: DragEvent) => {
                    if (draggedId && draggedId !== page.id) {
                      event.preventDefault();
                      event.stopPropagation();
                      setDropBeforeId(page.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDropBeforeId(null);
                  }}
                  onClick={() => onOpenPage(page.id)}
                >
                  <div className="wdb-card__title">
                    <HighlightedText text={page.title || "제목 없음"} query={query} />
                  </div>
                  {page.description && (
                    <div className="wdb-card__desc">
                      <HighlightedText text={page.description} query={query} />
                    </div>
                  )}
                  {(page.tags.length > 0 || page.dueDate) && (
                    <div className="wdb-card__meta">
                      <TagChips tags={page.tags} />
                      {page.dueDate && <span className="wdb-card__date">{formatKoreanDate(page.dueDate)}</span>}
                    </div>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" className="wdb-board__add" onClick={() => createInCategory(col.key)}>
                  + 신규 item
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="wdb-table-wrap">
          <table className="wdb-table">
            <thead>
              <tr>
                <th className="wdb-table__checkcol">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={selected.size > 0 && selected.size === sortedList.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(sortedList.map((p) => p.id)) : new Set())}
                  />
                </th>
                <SortableHeader field="title" sort={sort} onToggle={toggleSort}>
                  자료명
                </SortableHeader>
                <SortableHeader field="category" sort={sort} onToggle={toggleSort}>
                  카테고리
                </SortableHeader>
                <th>설명</th>
                <th>태그</th>
                <SortableHeader field="date" sort={sort} onToggle={toggleSort}>
                  날짜
                </SortableHeader>
                <SortableHeader field="updatedAt" sort={sort} onToggle={toggleSort}>
                  마지막 수정일
                </SortableHeader>
                <th>수정자</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((page) => (
                <tr key={page.id} className={selected.has(page.id) ? "wdb-table__row wdb-table__row--selected" : "wdb-table__row"}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`${page.title} 선택`} checked={selected.has(page.id)} onChange={() => toggleSelect(page.id)} />
                  </td>
                  <td>
                    <button type="button" className="wdb-table__title" onClick={() => onOpenPage(page.id)}>
                      <HighlightedText text={page.title || "제목 없음"} query={query} />
                    </button>
                  </td>
                  <td>
                    <CategoryBadge category={page.category} categories={categories} />
                  </td>
                  <td className="wdb-table__desc">{page.description ?? ""}</td>
                  <td>
                    <TagChips tags={page.tags} />
                  </td>
                  <td>{formatKoreanDate(page.dueDate) ?? ""}</td>
                  <td>{formatKoreanDate(page.updatedAt.slice(0, 10))}</td>
                  <td>{page.updatedBy ? memberName(members, page.updatedBy) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  field,
  sort,
  onToggle,
  children,
}: {
  field: SortField;
  sort: { field: SortField; dir: "asc" | "desc" };
  onToggle: (field: SortField) => void;
  children: ReactNode;
}) {
  const active = sort.field === field;
  return (
    <th>
      <button type="button" className="wdb-table__sort" onClick={() => onToggle(field)}>
        {children}
        {active && <span className="wdb-table__sort-arrow">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
