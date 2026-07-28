import { useMemo, useState } from "react";
import type { HandoffStatus, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import { api } from "@/lib/api";
import { StatusBadge, STATUS_LABELS, nextStatus } from "@/features/status/Status";
import { memberName } from "@/hooks/useTeamMembers";

const STATUS_ORDER: HandoffStatus[] = ["in_progress", "handoff_pending", "done", "on_hold"];

export type DatabaseViewType = "table" | "board" | "gallery" | "calendar" | "list";

export function DatabaseView({
  parentId,
  view,
  pages,
  members,
  editable,
  onOpenPage,
  onPagesChanged,
}: {
  parentId: string;
  view: DatabaseViewType;
  pages: PageSummaryDTO[];
  members: TeamMemberDTO[];
  editable: boolean;
  onOpenPage: (id: string) => void;
  onPagesChanged: () => void;
}) {
  const children = useMemo(
    () => pages.filter((p) => p.parentId === parentId && !p.isDeleted).sort((a, b) => a.orderKey - b.orderKey),
    [pages, parentId],
  );

  const patch = async (child: PageSummaryDTO, fields: { status?: HandoffStatus; assigneeId?: string | null; dueDate?: string | null }) => {
    if (!editable) return;
    const detail = await api.getPage(child.id);
    await api.updatePageMeta(child.id, { expectedVersion: detail.version, ...fields });
    onPagesChanged();
  };

  if (children.length === 0) {
    return <div className="db-view db-view--empty">하위 페이지가 없습니다. 사이드바나 /page로 하위 페이지를 먼저 만들어보세요.</div>;
  }

  if (view === "table") {
    return (
      <div className="db-view">
        <table className="db-table">
          <thead>
            <tr>
              <th>제목</th>
              <th>상태</th>
              <th>담당자</th>
              <th>마감일</th>
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
                <td>
                  <select value={c.status} disabled={!editable} onChange={(e) => patch(c, { status: e.target.value as HandoffStatus })}>
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
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
                <td>
                  <input type="date" value={c.dueDate ?? ""} disabled={!editable} onChange={(e) => patch(c, { dueDate: e.target.value || null })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "board") {
    return (
      <div className="db-view db-board">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="db-board__col">
            <div className="db-board__col-title">{STATUS_LABELS[s]}</div>
            {children
              .filter((c) => c.status === s)
              .map((c) => (
                <div key={c.id} className="db-board__card">
                  <button type="button" className="db-board__card-title" onClick={() => onOpenPage(c.id)}>
                    {c.title}
                  </button>
                  <div className="db-board__card-meta">
                    <StatusBadge status={c.status} onCycle={editable ? () => patch(c, { status: nextStatus(c.status) }) : undefined} />
                    {c.assigneeId && <span className="db-board__card-assignee">{memberName(members, c.assigneeId)}</span>}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  }

  if (view === "gallery") {
    return (
      <div className="db-view db-gallery">
        {children.map((c) => (
          <button key={c.id} type="button" className="db-gallery__card" onClick={() => onOpenPage(c.id)}>
            <div className="db-gallery__title">{c.title}</div>
            <StatusBadge status={c.status} />
          </button>
        ))}
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="db-view db-list">
        {children.map((c) => (
          <div key={c.id} className="db-list__row" onClick={() => onOpenPage(c.id)}>
            <span className="db-list__title">{c.title}</span>
            <StatusBadge status={c.status} />
            {c.assigneeId && <span className="db-list__assignee">{memberName(members, c.assigneeId)}</span>}
            {c.dueDate && <span className="db-list__due">{c.dueDate}</span>}
          </div>
        ))}
      </div>
    );
  }

  return <CalendarGrid items={children} onOpenPage={onOpenPage} />;
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
    <div className="db-view db-calendar">
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
