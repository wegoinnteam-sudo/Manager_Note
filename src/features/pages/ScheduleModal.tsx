import { useEffect, useRef, useState } from "react";
import type { PageCategory } from "@shared/types";
import { CATEGORY_LABELS, PAGE_CATEGORIES, UNCATEGORIZED_LABEL } from "@shared/types";
import { Modal } from "@/components/Modal";

export interface ScheduleFormValues {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  category: PageCategory | null;
}

export function ScheduleModal({
  mode,
  initial,
  authorName,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: ScheduleFormValues;
  authorName: string;
  onSave: (values: ScheduleFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ScheduleFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Basic focus trap: Tab/Shift+Tab cycles only through this modal's own
  // focusable elements instead of escaping into the page behind it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const titleMissing = values.title.trim() === "";
  const dateOutOfOrder = values.endDate < values.startDate;
  const sameDayTimeWarning =
    !values.allDay && values.startDate === values.endDate && values.startTime && values.endTime && values.endTime < values.startTime;

  const canSave = !titleMissing && !dateOutOfOrder && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch {
      setError("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={mode === "create" ? "일정 추가" : "일정 수정"} onClose={onCancel}>
      <div ref={containerRef} className="schedule-modal">
        <label className="schedule-modal__field">
          <span>제목 *</span>
          <input
            ref={titleRef}
            type="text"
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
            placeholder="일정 제목"
            maxLength={300}
          />
        </label>

        <label className="schedule-modal__field">
          <span>내용/메모</span>
          <textarea
            rows={3}
            value={values.description}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
            placeholder="선택 사항"
          />
        </label>

        <div className="schedule-modal__row">
          <label className="schedule-modal__field">
            <span>시작일 *</span>
            <input type="date" value={values.startDate} onChange={(e) => setValues({ ...values, startDate: e.target.value })} />
          </label>
          <label className="schedule-modal__field">
            <span>종료일 *</span>
            <input type="date" value={values.endDate} onChange={(e) => setValues({ ...values, endDate: e.target.value })} />
          </label>
        </div>
        {dateOutOfOrder && <div className="schedule-modal__error">종료일은 시작일보다 빠를 수 없습니다.</div>}

        <label className="schedule-modal__checkbox">
          <input type="checkbox" checked={values.allDay} onChange={(e) => setValues({ ...values, allDay: e.target.checked })} />
          종일 일정
        </label>

        {!values.allDay && (
          <div className="schedule-modal__row">
            <label className="schedule-modal__field">
              <span>시작 시간</span>
              <input type="time" value={values.startTime} onChange={(e) => setValues({ ...values, startTime: e.target.value })} />
            </label>
            <label className="schedule-modal__field">
              <span>종료 시간</span>
              <input type="time" value={values.endTime} onChange={(e) => setValues({ ...values, endTime: e.target.value })} />
            </label>
          </div>
        )}
        {sameDayTimeWarning && <div className="schedule-modal__warning">종료 시간이 시작 시간보다 빠릅니다. 확인해주세요.</div>}

        <label className="schedule-modal__field">
          <span>카테고리 (일정 색상)</span>
          <select
            value={values.category ?? ""}
            onChange={(e) => setValues({ ...values, category: (e.target.value || null) as PageCategory | null })}
          >
            <option value="">{UNCATEGORIZED_LABEL}</option>
            {PAGE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <div className="schedule-modal__row schedule-modal__meta">
          <div>
            <span>작성자</span>
            <strong>{authorName}</strong>
          </div>
        </div>

        {error && <div className="schedule-modal__error">{error}</div>}

        <div className="schedule-modal__actions">
          <button type="button" onClick={onCancel} disabled={saving}>
            취소
          </button>
          <button type="button" className="schedule-modal__save" onClick={submit} disabled={!canSave}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
