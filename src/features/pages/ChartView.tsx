import { useMemo } from "react";
import type { HandoffStatus, PageSummaryDTO } from "@shared/types";
import { STATUS_LABELS } from "@/features/status/Status";

const STATUS_ORDER: HandoffStatus[] = ["in_progress", "handoff_pending", "done", "on_hold"];

export function ChartView({ parentId, pages }: { parentId: string; pages: PageSummaryDTO[] }) {
  const children = useMemo(() => pages.filter((p) => p.parentId === parentId && !p.isDeleted), [pages, parentId]);

  if (children.length === 0) {
    return <div className="db-view db-view--empty">하위 페이지가 없습니다. 그래프로 볼 데이터가 아직 없어요.</div>;
  }

  const counts = STATUS_ORDER.map((status) => ({ status, count: children.filter((c) => c.status === status).length }));
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="db-view db-chart">
      <div className="db-chart__total">전체 {children.length}개</div>
      {counts.map(({ status, count }) => (
        <div key={status} className="db-chart__row">
          <span className="db-chart__label">{STATUS_LABELS[status]}</span>
          <span className="db-chart__track">
            <span className={`db-chart__bar db-chart__bar--${status}`} style={{ width: `${(count / max) * 100}%` }} title={`${STATUS_LABELS[status]}: ${count}개`} />
          </span>
          <span className="db-chart__count">{count}</span>
        </div>
      ))}
    </div>
  );
}
