import { useEffect, useState } from "react";
import type { StatusHistoryDTO, TeamMemberDTO } from "@shared/types";
import { api } from "@/lib/api";
import { STATUS_LABELS } from "@/features/status/Status";
import { memberName } from "@/hooks/useTeamMembers";

export function History({ pageId, members }: { pageId: string; members: TeamMemberDTO[] }) {
  const [history, setHistory] = useState<StatusHistoryDTO[]>([]);

  useEffect(() => {
    api.listHistory(pageId).then((r) => setHistory(r.history));
  }, [pageId]);

  if (history.length === 0) return null;

  return (
    <div className="section">
      <div className="section__title">변경 이력</div>
      {history.map((h) => (
        <div className="history-row" key={h.id}>
          <span>
            {h.fromStatus ? STATUS_LABELS[h.fromStatus] : "(없음)"} → {STATUS_LABELS[h.toStatus]}
          </span>
          <span>{memberName(members, h.changedBy)}</span>
          <span>{new Date(h.changedAt).toLocaleString("ko-KR")}</span>
        </div>
      ))}
    </div>
  );
}
