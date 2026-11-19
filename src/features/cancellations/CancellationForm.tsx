import { useState } from "react";
import type { CancellationInput } from "@shared/cancellations";
import type { CancellationRecord } from "./types";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Register / edit one free-cancellation record. */
export function CancellationForm({
  initial,
  defaultManager,
  onSubmit,
  onCancel,
}: {
  initial?: CancellationRecord;
  defaultManager: string;
  onSubmit: (input: CancellationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    cancelDate: initial?.cancelDate ?? today(),
    reservationNumber: initial?.reservationNumber ?? "",
    guestName: initial?.guestName ?? "",
    checkInDate: initial?.checkInDate ?? "",
    full: initial ? initial.cancellationRate >= 100 : true,
    rate: initial && initial.cancellationRate < 100 ? String(initial.cancellationRate) : "50",
    manager: initial?.manager ?? defaultManager,
    reason: initial?.reason ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const rate = form.full ? 100 : Number(form.rate);
  const rateValid = Number.isInteger(rate) && rate >= 1 && rate <= 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateValid) {
      setError("부분취소 비율은 1~100 사이 숫자로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        cancelDate: form.cancelDate,
        reservationNumber: form.reservationNumber.trim(),
        guestName: form.guestName.trim(),
        checkInDate: form.checkInDate,
        cancellationRate: rate,
        manager: form.manager.trim(),
        reason: form.reason.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
      setSaving(false);
    }
  };

  return (
    <form className="cx-form" onSubmit={submit}>
      <label className="cx-field">
        <span>취소날짜 *</span>
        <input type="date" required value={form.cancelDate} onChange={(e) => set({ cancelDate: e.target.value })} />
      </label>
      <label className="cx-field">
        <span>체크인 날짜 *</span>
        <input type="date" required value={form.checkInDate} onChange={(e) => set({ checkInDate: e.target.value })} />
      </label>
      <label className="cx-field">
        <span>예약번호 *</span>
        <input required maxLength={60} value={form.reservationNumber} onChange={(e) => set({ reservationNumber: e.target.value })} autoFocus />
      </label>
      <label className="cx-field">
        <span>성함 *</span>
        <input required maxLength={100} value={form.guestName} onChange={(e) => set({ guestName: e.target.value })} />
      </label>
      <fieldset className="cx-field cx-form__rate">
        <span>취소율</span>
        <div>
          <label><input type="radio" name="cx-rate" checked={form.full} onChange={() => set({ full: true })} /> 100% 취소</label>
          <label><input type="radio" name="cx-rate" checked={!form.full} onChange={() => set({ full: false })} /> 부분취소</label>
          {!form.full && (
            <span className="cx-form__pct">
              <input type="number" aria-label="부분취소 비율" min={1} max={99} value={form.rate} onChange={(e) => set({ rate: e.target.value })} />%
            </span>
          )}
        </div>
      </fieldset>
      <label className="cx-field">
        <span>담당자</span>
        <input maxLength={60} value={form.manager} onChange={(e) => set({ manager: e.target.value })} />
      </label>
      <label className="cx-field cx-form__wide">
        <span>사유</span>
        <textarea rows={3} maxLength={2000} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
      </label>
      {error && <p className="cx-form__error" role="alert">{error}</p>}
      <div className="cx-form__actions">
        <button type="button" className="cx-btn" onClick={onCancel} disabled={saving}>취소</button>
        <button type="submit" className="cx-btn cx-btn--primary" disabled={saving}>{saving ? "저장 중…" : initial ? "수정 저장" : "등록"}</button>
      </div>
    </form>
  );
}
