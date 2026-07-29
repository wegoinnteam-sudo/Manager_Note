import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DatabaseViewFilter,
  DatabaseViewGroupBy,
  DatabaseViewProperty,
  DatabaseViewSort,
  DatabaseTemplate,
  HandoffStatus,
  PageBlock,
  PageSummaryDTO,
  TeamMemberDTO,
} from "@shared/types";
import { api } from "@/lib/api";
import { StatusBadge, STATUS_LABELS, nextStatus } from "@/features/status/Status";
import { memberName } from "@/hooks/useTeamMembers";

const STATUS_ORDER: HandoffStatus[] = ["in_progress", "handoff_pending", "done", "on_hold"];

export type DatabaseViewType = "table" | "board" | "gallery" | "calendar" | "list";

const VIEW_TYPE_LABELS: Record<DatabaseViewType, string> = {
  table: "표",
  board: "보드",
  gallery: "갤러리",
  calendar: "캘린더",
  list: "리스트",
};

const PROPERTY_LABELS: Record<DatabaseViewProperty, string> = {
  status: "상태",
  assigneeId: "담당자",
  dueDate: "마감일",
  overdue: "기한 지남",
  daysRemaining: "남은 일수",
  subItems: "하위 항목",
};

const DEFAULT_PROPERTIES: DatabaseViewProperty[] = ["status", "assigneeId", "dueDate", "overdue"];

type DbViewBlock = Extract<PageBlock, { type: "database_view" }>;

type PatchFields = { status?: HandoffStatus; assigneeId?: string | null; dueDate?: string | null };
type TemplateDraft = {
  id?: string;
  name: string;
  title: string;
  status: HandoffStatus;
  assigneeId: string;
  dueDate: string;
  body: string;
};

function fieldValue(c: PageSummaryDTO, field: DatabaseViewSort["field"]): string {
  switch (field) {
    case "title":
      return c.title;
    case "status":
      return c.status;
    case "assigneeId":
      return c.assigneeId ?? "";
    case "dueDate":
      return c.dueDate ?? "";
    case "updatedAt":
      return c.updatedAt;
    default:
      return "";
  }
}

function matchesFilter(c: PageSummaryDTO, f: DatabaseViewFilter): boolean {
  const value = fieldValue(c, f.field);
  switch (f.op) {
    case "eq":
      return value === (f.value ?? "");
    case "neq":
      return value !== (f.value ?? "");
    case "isEmpty":
      return !value;
    case "isNotEmpty":
      return !!value;
    default:
      return true;
  }
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function FormulaValue({ page, property, subItemCount = 0 }: { page: PageSummaryDTO; property: DatabaseViewProperty; subItemCount?: number }) {
  if (property === "overdue") {
    const days = daysUntil(page.dueDate);
    return days !== null && days < 0 && page.status !== "done" ? <span className="db-formula db-formula--overdue">기한 지남</span> : <span className="db-formula">—</span>;
  }
  if (property === "daysRemaining") {
    const days = daysUntil(page.dueDate);
    return <span className="db-formula">{days === null ? "—" : days === 0 ? "오늘" : days > 0 ? `${days}일 남음` : `${Math.abs(days)}일 지남`}</span>;
  }
  if (property === "subItems") {
    return <span className="db-formula">{subItemCount}</span>;
  }
  return null;
}

export function DatabaseView({
  block,
  parentId,
  pages,
  members,
  editable,
  onOpenPage,
  onPagesChanged,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  block: DbViewBlock;
  parentId: string;
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
  editable: boolean;
  onOpenPage: (id: string) => void;
  onPagesChanged: () => void;
  onPatch: (patch: Partial<DbViewBlock>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const view = block.view;
  const properties = block.properties ?? DEFAULT_PROPERTIES;
  const filter = block.filter ?? null;
  const sort = block.sort ?? null;
  const groupBy = block.groupBy ?? "status";
  const sourceParentId = block.sourcePageId ?? parentId;
  const locked = block.locked ?? false;

  const [menuOpen, setMenuOpen] = useState<null | "root" | "edit">(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(block.name ?? "");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const allChildren = useMemo(
    () => pages.filter((p) => p.parentId === sourceParentId && !p.isDeleted).sort((a, b) => a.orderKey - b.orderKey),
    [pages, sourceParentId],
  );

  const filteredChildren = useMemo(() => (filter ? allChildren.filter((c) => matchesFilter(c, filter)) : allChildren), [allChildren, filter]);
  const subItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    pages.forEach((page) => {
      if (page.parentId && !page.isDeleted) counts.set(page.parentId, (counts.get(page.parentId) ?? 0) + 1);
    });
    return counts;
  }, [pages]);

  const children = useMemo(() => {
    if (!sort) return filteredChildren;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filteredChildren].sort((a, b) => {
      const va = fieldValue(a, sort.field);
      const vb = fieldValue(b, sort.field);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filteredChildren, sort]);

  const patch = async (child: PageSummaryDTO, fields: PatchFields) => {
    if (!editable) return;
    const detail = await api.getPage(child.id);
    await api.updatePageMeta(child.id, { expectedVersion: detail.version, ...fields });
    onPagesChanged();
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/page/${parentId}#block-${block.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const commitName = () => {
    if (locked) return;
    onPatch({ name: nameDraft.trim() || undefined });
    setRenaming(false);
  };

  const createItem = async (template?: DatabaseTemplate) => {
    if (!editable || creating) return;
    setCreating(true);
    try {
      let page = await api.createPage({ parentId: sourceParentId, title: template?.title || "제목 없음" });
      if (template && (template.status || template.assigneeId !== undefined || template.dueDate !== undefined)) {
        page = await api.updatePageMeta(page.id, {
          expectedVersion: page.version,
          status: template.status,
          assigneeId: template.assigneeId,
          dueDate: template.dueDate,
        });
      }
      if (template?.content.blocks.length) {
        page = await api.updatePageContent(page.id, page.version, template.content);
      }
      onPagesChanged();
      onOpenPage(page.id);
    } finally {
      setCreating(false);
    }
  };

  const saveTemplate = (draft: TemplateDraft) => {
    const template: DatabaseTemplate = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim() || "새 템플릿",
      title: draft.title.trim() || "제목 없음",
      status: draft.status,
      assigneeId: draft.assigneeId || null,
      dueDate: draft.dueDate || null,
      content: {
        blocks: draft.body.trim()
          ? [{ id: crypto.randomUUID(), type: "paragraph", text: draft.body }]
          : [],
      },
    };
    const templates = block.templates ?? [];
    onPatch({
      templates: draft.id
        ? templates.map((item) => (item.id === draft.id ? template : item))
        : [...templates, template],
    });
    setTemplateDraft(null);
  };

  const viewName = block.name?.trim() || VIEW_TYPE_LABELS[view];

  return (
    <div className="db-view">
      <div className="db-view__header">
        {renaming ? (
          <input
            className="db-view__name-input"
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span className="db-view__name">{viewName}</span>
        )}
        <div className="db-view__tabs" aria-label="데이터베이스 보기">
          {(Object.keys(VIEW_TYPE_LABELS) as DatabaseViewType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={type === view ? "db-view__tab db-view__tab--active" : "db-view__tab"}
              disabled={!editable || locked}
              onClick={() => onPatch({ view: type })}
            >
              {VIEW_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {editable && (
          <>
            <button type="button" className="db-view__new-btn" disabled={creating} onClick={() => createItem()}>
              {creating ? "추가 중…" : "새로 만들기"}
            </button>
            <select
              className="db-view__template-select"
              aria-label="데이터베이스 템플릿"
              value=""
              disabled={creating}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__new__") {
                  setTemplateDraft({
                    name: "",
                    title: "",
                    status: "in_progress",
                    assigneeId: "",
                    dueDate: "",
                    body: "",
                  });
                  return;
                }
                const template = block.templates?.find((item) => item.id === value);
                if (template) createItem(template);
              }}
            >
              <option value="">▼</option>
              {(block.templates ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
              {!locked && <option value="__new__">+ 새 템플릿</option>}
            </select>
          </>
        )}
        {editable && (
          <div className="db-view__menu-wrap" ref={menuWrapRef}>
            <button type="button" className="db-view__menu-btn" onClick={() => setMenuOpen(menuOpen ? null : "root")} title="보기 설정">
              ⋯
            </button>
            {menuOpen === "root" && (
              <div className="db-view-menu">
                {!locked && (
                  <>
                    <button
                      type="button"
                      className="db-view-menu__item"
                      onClick={() => {
                        setNameDraft(block.name ?? "");
                        setRenaming(true);
                        setMenuOpen(null);
                      }}
                    >
                      이름 바꾸기
                    </button>
                    <button type="button" className="db-view-menu__item" onClick={() => setMenuOpen("edit")}>
                      보기 편집
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="db-view-menu__item"
                  onClick={() => {
                    onPatch({ locked: !locked });
                    setMenuOpen(null);
                  }}
                >
                  {locked ? "데이터베이스 잠금 해제" : "데이터베이스 잠금"}
                </button>
                <button type="button" className="db-view-menu__item" onClick={copyLink}>
                  {copied ? "복사됨!" : "보기 링크 복사"}
                </button>
                <button
                  type="button"
                  className="db-view-menu__item"
                  onClick={() => {
                    onDuplicate();
                    setMenuOpen(null);
                  }}
                >
                  보기 복제
                </button>
                <button
                  type="button"
                  className="db-view-menu__item db-view-menu__item--danger"
                  onClick={() => {
                    onRemove();
                    setMenuOpen(null);
                  }}
                >
                  보기 삭제
                </button>
              </div>
            )}
            {menuOpen === "edit" && (
              <DatabaseViewEditPanel
                view={view}
                properties={properties}
                filter={filter}
                sort={sort}
                groupBy={groupBy}
                members={members}
                pages={pages}
                sourcePageId={sourceParentId}
                currentPageId={parentId}
                onChange={(p) => onPatch(p)}
                onClose={() => setMenuOpen(null)}
              />
            )}
          </div>
        )}
      </div>
      {templateDraft && (
        <DatabaseTemplateEditor
          draft={templateDraft}
          members={members}
          onChange={setTemplateDraft}
          onSave={() => saveTemplate(templateDraft)}
          onCancel={() => setTemplateDraft(null)}
        />
      )}
      {!locked && (block.templates?.length ?? 0) > 0 && (
        <div className="db-template-list">
          {(block.templates ?? []).map((template) => (
            <div key={template.id} className="db-template-list__item">
              <span>{template.name}</span>
              <button
                type="button"
                onClick={() =>
                  setTemplateDraft({
                    id: template.id,
                    name: template.name,
                    title: template.title,
                    status: template.status ?? "in_progress",
                    assigneeId: template.assigneeId ?? "",
                    dueDate: template.dueDate ?? "",
                    body:
                      template.content.blocks
                        .map((item) => (item.type === "paragraph" ? item.text : null))
                        .filter((text): text is string => text !== null)
                        .join("\n") ?? "",
                  })
                }
              >
                편집
              </button>
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    templates: [
                      ...(block.templates ?? []),
                      { ...template, id: crypto.randomUUID(), name: `${template.name} 복사본` },
                    ],
                  })
                }
              >
                복제
              </button>
              <button type="button" onClick={() => onPatch({ templates: block.templates?.filter((item) => item.id !== template.id) })}>
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {children.length === 0 ? (
        <div className="db-view--empty">
          <span>아직 항목이 없습니다.</span>
          {editable && (
            <button type="button" disabled={creating} onClick={() => createItem()}>
              + 새 페이지
            </button>
          )}
        </div>
      ) : view === "table" ? (
        <TableView children={children} members={members} properties={properties} subItemCounts={subItemCounts} editable={editable} onOpenPage={onOpenPage} patch={patch} />
      ) : view === "board" ? (
        <BoardView children={children} members={members} groupBy={groupBy} editable={editable} onOpenPage={onOpenPage} patch={patch} />
      ) : view === "gallery" ? (
        <GalleryView children={children} members={members} properties={properties} subItemCounts={subItemCounts} onOpenPage={onOpenPage} />
      ) : view === "list" ? (
        <ListView children={children} members={members} properties={properties} subItemCounts={subItemCounts} onOpenPage={onOpenPage} />
      ) : (
        <CalendarGrid items={children} onOpenPage={onOpenPage} />
      )}
    </div>
  );
}

function DatabaseTemplateEditor({
  draft,
  members,
  onChange,
  onSave,
  onCancel,
}: {
  draft: TemplateDraft;
  members: TeamMemberDTO[];
  onChange: (draft: TemplateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="db-template-editor">
      <div className="db-template-editor__title">{draft.id ? "템플릿 편집" : "새 템플릿"}</div>
      <label>
        템플릿 이름
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="예: 버그 리포트" />
      </label>
      <label>
        새 페이지 제목
        <input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="예: 새 버그" />
      </label>
      <div className="db-template-editor__row">
        <label>
          기본 상태
          <select value={draft.status} onChange={(e) => onChange({ ...draft, status: e.target.value as HandoffStatus })}>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          기본 담당자
          <select value={draft.assigneeId} onChange={(e) => onChange({ ...draft, assigneeId: e.target.value })}>
            <option value="">미지정</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          기본 마감일
          <input type="date" value={draft.dueDate} onChange={(e) => onChange({ ...draft, dueDate: e.target.value })} />
        </label>
      </div>
      <label>
        미리 채울 본문
        <textarea rows={5} value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })} placeholder="새 페이지에 들어갈 안내문이나 체크 내용을 입력하세요." />
      </label>
      <div className="db-template-editor__actions">
        <button type="button" onClick={onCancel}>취소</button>
        <button type="button" className="db-template-editor__save" onClick={onSave}>저장</button>
      </div>
    </div>
  );
}

function DatabaseViewEditPanel({
  view,
  properties,
  filter,
  sort,
  groupBy,
  members,
  pages,
  sourcePageId,
  currentPageId,
  onChange,
  onClose,
}: {
  view: DatabaseViewType;
  properties: DatabaseViewProperty[];
  filter: DatabaseViewFilter | null;
  sort: DatabaseViewSort | null;
  groupBy: DatabaseViewGroupBy;
  members: TeamMemberDTO[];
  pages: PageSummaryDTO[];
  sourcePageId: string;
  currentPageId: string;
  onChange: (patch: Partial<DbViewBlock>) => void;
  onClose: () => void;
}) {
  const toggleProperty = (p: DatabaseViewProperty) => {
    const next = properties.includes(p) ? properties.filter((x) => x !== p) : [...properties, p];
    onChange({ properties: next });
  };

  return (
    <div className="db-view-menu db-view-menu--edit">
      <div className="db-view-menu__section-title">데이터 소스</div>
      <select
        value={sourcePageId}
        onChange={(e) => onChange({ sourcePageId: e.target.value === currentPageId ? undefined : e.target.value })}
      >
        <option value={currentPageId}>현재 페이지의 하위 페이지</option>
        {pages
          .filter((p) => !p.isDeleted && p.id !== currentPageId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
      </select>

      <div className="db-view-menu__section-title">속성</div>
      {(Object.keys(PROPERTY_LABELS) as DatabaseViewProperty[]).map((p) => (
        <label key={p} className="db-view-menu__checkbox">
          <input type="checkbox" checked={properties.includes(p)} onChange={() => toggleProperty(p)} />
          {PROPERTY_LABELS[p]}
        </label>
      ))}

      <div className="db-view-menu__section-title">필터</div>
      <div className="db-view-menu__row">
        <select
          value={filter?.field ?? ""}
          onChange={(e) => {
            const field = e.target.value as DatabaseViewProperty | "";
            onChange({ filter: field ? { field, op: "eq", value: "" } : null });
          }}
        >
          <option value="">필터 없음</option>
          <option value="status">상태</option>
          <option value="assigneeId">담당자</option>
          <option value="dueDate">마감일</option>
        </select>
        {filter && (
          <select value={filter.op} onChange={(e) => onChange({ filter: { ...filter, op: e.target.value as DatabaseViewFilter["op"] } })}>
            <option value="eq">이다</option>
            <option value="neq">아니다</option>
            <option value="isEmpty">비어있음</option>
            <option value="isNotEmpty">비어있지 않음</option>
          </select>
        )}
        {filter && (filter.op === "eq" || filter.op === "neq") ? (
          filter.field === "status" ? (
            <select value={filter.value ?? ""} onChange={(e) => onChange({ filter: { ...filter, value: e.target.value } })}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : filter.field === "assigneeId" ? (
            <select value={filter.value ?? ""} onChange={(e) => onChange({ filter: { ...filter, value: e.target.value } })}>
              <option value="">미지정</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="date" value={filter.value ?? ""} onChange={(e) => onChange({ filter: { ...filter, value: e.target.value } })} />
          )
        ) : null}
      </div>

      <div className="db-view-menu__section-title">정렬</div>
      <div className="db-view-menu__row">
        <select
          value={sort?.field ?? ""}
          onChange={(e) => {
            const field = e.target.value as DatabaseViewSort["field"] | "";
            onChange({ sort: field ? { field, direction: sort?.direction ?? "asc" } : null });
          }}
        >
          <option value="">정렬 없음</option>
          <option value="title">이름</option>
          <option value="status">상태</option>
          <option value="dueDate">마감일</option>
          <option value="updatedAt">최근 수정</option>
        </select>
        {sort && (
          <select value={sort.direction} onChange={(e) => onChange({ sort: { ...sort, direction: e.target.value as "asc" | "desc" } })}>
            <option value="asc">오름차순</option>
            <option value="desc">내림차순</option>
          </select>
        )}
      </div>

      {view === "board" && (
        <>
          <div className="db-view-menu__section-title">그룹</div>
          <select value={groupBy} onChange={(e) => onChange({ groupBy: e.target.value as DatabaseViewGroupBy })}>
            <option value="status">상태</option>
            <option value="assigneeId">담당자</option>
            <option value="none">없음</option>
          </select>
        </>
      )}

      <button type="button" className="db-view-menu__close" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}

function TableView({
  children,
  members,
  properties,
  subItemCounts,
  editable,
  onOpenPage,
  patch,
}: {
  children: PageSummaryDTO[];
  members: TeamMemberDTO[];
  properties: DatabaseViewProperty[];
  subItemCounts: Map<string, number>;
  editable: boolean;
  onOpenPage: (id: string) => void;
  patch: (child: PageSummaryDTO, fields: PatchFields) => void;
}) {
  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>제목</th>
          {properties.includes("status") && <th>상태</th>}
          {properties.includes("assigneeId") && <th>담당자</th>}
          {properties.includes("dueDate") && <th>마감일</th>}
          {properties.includes("overdue") && <th>기한 지남</th>}
          {properties.includes("daysRemaining") && <th>남은 일수</th>}
          {properties.includes("subItems") && <th>하위 항목</th>}
        </tr>
      </thead>
      <tbody>
        {children.map((c) => (
          <tr key={c.id}>
            <td>
              <button type="button" className="db-table__title" onClick={() => onOpenPage(c.id)}>
                {c.title}
              </button>
            </td>
            {properties.includes("status") && (
              <td>
                <select value={c.status} disabled={!editable} onChange={(e) => patch(c, { status: e.target.value as HandoffStatus })}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </td>
            )}
            {properties.includes("assigneeId") && (
              <td>
                <select value={c.assigneeId ?? ""} disabled={!editable} onChange={(e) => patch(c, { assigneeId: e.target.value || null })}>
                  <option value="">미지정</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </td>
            )}
            {properties.includes("dueDate") && (
              <td>
                <input type="date" value={c.dueDate ?? ""} disabled={!editable} onChange={(e) => patch(c, { dueDate: e.target.value || null })} />
              </td>
            )}
            {properties.includes("overdue") && <td><FormulaValue page={c} property="overdue" /></td>}
            {properties.includes("daysRemaining") && <td><FormulaValue page={c} property="daysRemaining" /></td>}
            {properties.includes("subItems") && <td><FormulaValue page={c} property="subItems" subItemCount={subItemCounts.get(c.id) ?? 0} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BoardCard({
  c,
  members,
  editable,
  onOpenPage,
  patch,
}: {
  c: PageSummaryDTO;
  members: TeamMemberDTO[];
  editable: boolean;
  onOpenPage: (id: string) => void;
  patch: (child: PageSummaryDTO, fields: PatchFields) => void;
}) {
  return (
    <div className="db-board__card">
      <button type="button" className="db-board__card-title" onClick={() => onOpenPage(c.id)}>
        {c.title}
      </button>
      <div className="db-board__card-meta">
        <StatusBadge status={c.status} onCycle={editable ? () => patch(c, { status: nextStatus(c.status) }) : undefined} />
        {c.assigneeId && <span className="db-board__card-assignee">{memberName(members, c.assigneeId)}</span>}
      </div>
    </div>
  );
}

function BoardView({
  children,
  members,
  groupBy,
  editable,
  onOpenPage,
  patch,
}: {
  children: PageSummaryDTO[];
  members: TeamMemberDTO[];
  groupBy: DatabaseViewGroupBy;
  editable: boolean;
  onOpenPage: (id: string) => void;
  patch: (child: PageSummaryDTO, fields: PatchFields) => void;
}) {
  if (groupBy === "none") {
    return (
      <div className="db-board">
        <div className="db-board__col">
          <div className="db-board__col-title">전체</div>
          {children.map((c) => (
            <BoardCard key={c.id} c={c} members={members} editable={editable} onOpenPage={onOpenPage} patch={patch} />
          ))}
        </div>
      </div>
    );
  }

  if (groupBy === "assigneeId") {
    const groups = [...members.map((m) => ({ key: m.id, label: m.name })), { key: "", label: "미지정" }];
    return (
      <div className="db-board">
        {groups.map((g) => (
          <div key={g.key || "unassigned"} className="db-board__col">
            <div className="db-board__col-title">{g.label}</div>
            {children
              .filter((c) => (c.assigneeId ?? "") === g.key)
              .map((c) => (
                <BoardCard key={c.id} c={c} members={members} editable={editable} onOpenPage={onOpenPage} patch={patch} />
              ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="db-board">
      {STATUS_ORDER.map((s) => (
        <div key={s} className="db-board__col">
          <div className="db-board__col-title">{STATUS_LABELS[s]}</div>
          {children
            .filter((c) => c.status === s)
            .map((c) => (
              <BoardCard key={c.id} c={c} members={members} editable={editable} onOpenPage={onOpenPage} patch={patch} />
            ))}
        </div>
      ))}
    </div>
  );
}

function GalleryView({
  children,
  members,
  properties,
  subItemCounts,
  onOpenPage,
}: {
  children: PageSummaryDTO[];
  members: TeamMemberDTO[];
  properties: DatabaseViewProperty[];
  subItemCounts: Map<string, number>;
  onOpenPage: (id: string) => void;
}) {
  return (
    <div className="db-gallery">
      {children.map((c) => (
        <button key={c.id} type="button" className="db-gallery__card" onClick={() => onOpenPage(c.id)}>
          <div className="db-gallery__title">{c.title}</div>
          {properties.includes("status") && <StatusBadge status={c.status} />}
          {properties.includes("assigneeId") && c.assigneeId && <span className="db-list__assignee">{memberName(members, c.assigneeId)}</span>}
          {properties.includes("dueDate") && c.dueDate && <span className="db-list__due">{c.dueDate}</span>}
          {properties.includes("overdue") && <FormulaValue page={c} property="overdue" />}
          {properties.includes("daysRemaining") && <FormulaValue page={c} property="daysRemaining" />}
          {properties.includes("subItems") && <FormulaValue page={c} property="subItems" subItemCount={subItemCounts.get(c.id) ?? 0} />}
        </button>
      ))}
    </div>
  );
}

function ListView({
  children,
  members,
  properties,
  subItemCounts,
  onOpenPage,
}: {
  children: PageSummaryDTO[];
  members: TeamMemberDTO[];
  properties: DatabaseViewProperty[];
  subItemCounts: Map<string, number>;
  onOpenPage: (id: string) => void;
}) {
  return (
    <div className="db-list">
      {children.map((c) => (
        <div key={c.id} className="db-list__row" onClick={() => onOpenPage(c.id)}>
          <span className="db-list__title">{c.title}</span>
          {properties.includes("status") && <StatusBadge status={c.status} />}
          {properties.includes("assigneeId") && c.assigneeId && <span className="db-list__assignee">{memberName(members, c.assigneeId)}</span>}
          {properties.includes("dueDate") && c.dueDate && <span className="db-list__due">{c.dueDate}</span>}
          {properties.includes("overdue") && <FormulaValue page={c} property="overdue" />}
          {properties.includes("daysRemaining") && <FormulaValue page={c} property="daysRemaining" />}
          {properties.includes("subItems") && <FormulaValue page={c} property="subItems" subItemCount={subItemCounts.get(c.id) ?? 0} />}
        </div>
      ))}
    </div>
  );
}

function CalendarGrid({ items, onOpenPage }: { items: PageSummaryDTO[]; onOpenPage: (id: string) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const byDate = useMemo(() => {
    const map = new Map<string, PageSummaryDTO[]>();
    items.forEach((c) => {
      if (!c.dueDate) return;
      const list = map.get(c.dueDate) ?? [];
      list.push(c);
      map.set(c.dueDate, list);
    });
    return map;
  }, [items]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="db-calendar">
      <div className="db-calendar__nav">
        <button type="button" onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}>
          ‹
        </button>
        <span>
          {cursor.year}년 {cursor.month + 1}월
        </span>
        <button type="button" onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}>
          ›
        </button>
      </div>
      <div className="db-calendar__grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="db-calendar__weekday">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateKey = day ? `${cursor.year}-${pad(cursor.month + 1)}-${pad(day)}` : null;
          const dayItems = dateKey ? byDate.get(dateKey) ?? [] : [];
          return (
            <div key={i} className={`db-calendar__cell${day ? "" : " db-calendar__cell--empty"}`}>
              {day && <div className="db-calendar__day">{day}</div>}
              {dayItems.map((c) => (
                <button key={c.id} type="button" className="db-calendar__item" onClick={() => onOpenPage(c.id)}>
                  {c.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
