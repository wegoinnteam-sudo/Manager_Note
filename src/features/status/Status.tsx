import type { HandoffStatus } from "@shared/types";

export const STATUS_LABELS: Record<HandoffStatus, string> = {
  in_progress: "작업 중",
  handoff_pending: "인수인계 대기",
  done: "완료",
  on_hold: "보류",
};

const STATUS_ORDER: HandoffStatus[] = ["in_progress", "handoff_pending", "done", "on_hold"];

export function nextStatus(current: HandoffStatus): HandoffStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

export function StatusBadge({
  status,
  onCycle,
  disabled,
}: {
  status: HandoffStatus;
  onCycle?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`status-badge status-badge--${status}`}
      onClick={onCycle}
      disabled={disabled || !onCycle}
      title="클릭하면 다음 상태로 변경됩니다"
    >
      {STATUS_LABELS[status]}
    </button>
  );
}

export function StatusSelect({
  status,
  onChange,
  disabled,
}: {
  status: HandoffStatus;
  onChange: (next: HandoffStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={status}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as HandoffStatus)}
      style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--color-border)" }}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
