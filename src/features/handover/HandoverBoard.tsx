import { useEffect, useMemo, useState } from "react";
import type { HandoverCategory, HandoverNoticeDTO } from "@shared/types";
import { HANDOVER_ALL_ACK_NAMES, HANDOVER_CATEGORIES, HANDOVER_CATEGORY_LABELS } from "@shared/types";
// HANDOVER_ALL_ACK_NAMES above is only the fallback shown before the real
// roster (editable from 설정, see AdminSettings.tsx) has loaded.
import { api, uploadHandoverPhoto } from "@/lib/api";
import { compressImageForUpload } from "@/lib/imageCompression";
import { todayKey } from "@/features/pages/DatabaseView";
import "./handover.css";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

type ViewMode = "main" | "all" | HandoverCategory;

const VIEW_TITLES: Record<ViewMode, string> = {
  main: "메인보드 · 미완료 Notice",
  all: "전체 인수인계",
  hostel: "Hostel 인수인계",
  reception: "Reception 인수인계",
  repair: "Repair 인수인계",
  others: "Others 인수인계",
  everyone: "All 인수인계",
};

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatKoreanDate(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  const today = todayKey();
  const yesterday = new Date(Date.now() - 86_400_000);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const main = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(d);
  const sub = date === today ? "오늘" : date === yesterdayKey ? "어제" : null;
  return sub ? `${main}|${sub}` : main;
}

function readInitialView(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  if (v === "all" || (HANDOVER_CATEGORIES as string[]).includes(v ?? "")) return v as ViewMode;
  return "main";
}

// Drive's generated thumbnail can briefly 404 right after upload before
// Drive finishes generating it — fall back to the full preview so a
// just-added photo never shows a broken image icon. Same fix already used
// for page attachments, see AttachmentPicker.tsx's PickerThumb.
function PhotoThumb({ fileName, url, thumbnailUrl }: { fileName: string; url: string; thumbnailUrl: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className="hb-photo-thumb"
      src={failed ? url : thumbnailUrl}
      alt={fileName}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function HandoverBoard({
  canEdit,
  guestName,
  guestColors,
  notices,
  loaded,
  onNoticesChanged,
}: {
  canEdit: boolean;
  guestName: string;
  guestColors: Record<string, string>;
  notices: HandoverNoticeDTO[];
  loaded: boolean;
  onNoticesChanged: () => Promise<void> | void;
}) {
  const [view, setView] = useState<ViewMode>(readInitialView);
  const [dateFilter, setDateFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const hasFilters = Boolean(dateFilter || fromFilter || referenceFilter);
  const authors = useMemo(() => [...new Set(notices.map((n) => n.fromName))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")), [notices]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; sticky: boolean } | null>(null);
  const [draftCompleter, setDraftCompleter] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingNoticeId, setUploadingNoticeId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    noticeDate: string;
    noticeTime: string;
    fromName: string;
    category: HandoverCategory;
    reference: string;
    body: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);

  // Date/Time/From aren't typed in on the compose form — they're stamped
  // automatically (current date/time, current writer's name). `composeNow`
  // only drives the read-only preview; the values actually saved are re-read
  // at submit time so they reflect the moment of registration.
  const [composeNow, setComposeNow] = useState(() => ({ date: todayKey(), time: nowTime() }));
  const [formCategory, setFormCategory] = useState<HandoverCategory | "">("");
  const [formReference, setFormReference] = useState("");
  const [formBody, setFormBody] = useState("");
  const [ackRoster, setAckRoster] = useState<string[]>([...HANDOVER_ALL_ACK_NAMES]);

  useEffect(() => {
    api.listHandoverAckRoster().then(({ names }) => setAckRoster(names));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "main") params.set("view", view);
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `/handover?${qs}` : "/handover");
  }, [view]);

  useEffect(() => {
    if (!composeOpen) return;
    const tick = () => setComposeNow({ date: todayKey(), time: nowTime() });
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [composeOpen]);

  useEffect(() => {
    // Sticky (error) toasts stay up until manually closed — a 2.4s auto-hide
    // was too easy to miss on mobile, especially when the message is the
    // only clue to what actually went wrong.
    if (!toast || toast.sticky) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (text: string, sticky = false) => setToast({ text, sticky });

  // Real names to suggest for "From"/완료자, pulled from data already in the
  // app instead of a hardcoded roster: everyone who has ever written or
  // completed a notice here, everyone with a saved calendar color, and the
  // current visitor's own display name.
  const nameSuggestions = useMemo(() => {
    const names = new Set<string>();
    if (guestName) names.add(guestName);
    Object.keys(guestColors).forEach((name) => names.add(name));
    notices.forEach((notice) => {
      names.add(notice.fromName);
      if (notice.completedBy) names.add(notice.completedBy);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [guestName, guestColors, notices]);

  const counts = useMemo(() => {
    const done = notices.filter((n) => n.isDone).length;
    const byCategory: Record<HandoverCategory, number> = { hostel: 0, reception: 0, repair: 0, others: 0, everyone: 0 };
    notices.forEach((n) => {
      byCategory[n.category] += 1;
    });
    return { total: notices.length, open: notices.length - done, done, byCategory };
  }, [notices]);

  const visible = useMemo(() => {
    return notices.filter((n) => {
      if (dateFilter && n.noticeDate !== dateFilter) return false;
      if (fromFilter && n.fromName !== fromFilter) return false;
      if (referenceFilter.trim() && !n.reference.toLocaleLowerCase().includes(referenceFilter.trim().toLocaleLowerCase())) return false;
      if (view === "main") return !n.isDone;
      if (view === "all") return true;
      return n.category === view;
    });
  }, [notices, view, dateFilter, fromFilter, referenceFilter]);

  const completerFor = (notice: HandoverNoticeDTO) => draftCompleter[notice.id] ?? notice.completedBy ?? "";

  const toggleDone = async (notice: HandoverNoticeDTO, checked: boolean) => {
    if (checked) {
      const completedBy = completerFor(notice).trim();
      if (!completedBy) {
        showToast("완료자를 먼저 선택해주세요.");
        return;
      }
      setBusyId(notice.id);
      try {
        await api.setHandoverNoticeDone(notice.id, { isDone: true, completedBy });
        await onNoticesChanged();
        showToast("완료했습니다. 전체보기에서 다시 확인할 수 있습니다.");
      } finally {
        setBusyId(null);
      }
    } else {
      setBusyId(notice.id);
      try {
        await api.setHandoverNoticeDone(notice.id, { isDone: false });
        setDraftCompleter((current) => ({ ...current, [notice.id]: "" }));
        await onNoticesChanged();
        showToast("미완료 상태로 변경했습니다.");
      } finally {
        setBusyId(null);
      }
    }
  };

  const toggleAck = async (notice: HandoverNoticeDTO, name: string, checked: boolean) => {
    setBusyId(notice.id);
    try {
      await api.setHandoverNoticeAck(notice.id, { name, acked: checked });
      await onNoticesChanged();
    } finally {
      setBusyId(null);
    }
  };

  const deleteNotice = async (notice: HandoverNoticeDTO) => {
    if (!window.confirm("이 인수인계 항목을 삭제할까요? 삭제하면 되돌릴 수 없습니다.")) return;
    setDeletingId(notice.id);
    try {
      await api.deleteHandoverNotice(notice.id);
      await onNoticesChanged();
      showToast("삭제했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (notice: HandoverNoticeDTO) => {
    setEditingId(notice.id);
    setEditDraft({
      noticeDate: notice.noticeDate,
      noticeTime: notice.noticeTime,
      fromName: notice.fromName,
      category: notice.category,
      reference: notice.reference,
      body: notice.body,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async (notice: HandoverNoticeDTO) => {
    if (!editDraft || !editDraft.fromName.trim() || !editDraft.reference.trim() || !editDraft.body.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.updateHandoverNotice(notice.id, {
        noticeDate: editDraft.noticeDate,
        noticeTime: editDraft.noticeTime,
        fromName: editDraft.fromName.trim(),
        reference: editDraft.reference.trim(),
        category: editDraft.category,
        body: editDraft.body.trim(),
      });
      await onNoticesChanged();
      cancelEdit();
      showToast("수정했습니다.");
    } finally {
      setSavingEdit(false);
    }
  };

  const submitComment = async (notice: HandoverNoticeDTO) => {
    const text = (commentDrafts[notice.id] ?? "").trim();
    if (!text || postingCommentId === notice.id) return;
    setPostingCommentId(notice.id);
    try {
      await api.createHandoverComment(notice.id, text, guestName);
      setCommentDrafts((current) => ({ ...current, [notice.id]: "" }));
      await onNoticesChanged();
    } finally {
      setPostingCommentId(null);
    }
  };

  // Photos attach to an already-created notice (no pre-upload staging in
  // the compose form) — after submitting, the new row appears at the top
  // of the list and "📷 사진 추가" there works the same as any other row.
  // The input itself is single-select (no `multiple`) — some Android
  // gallery/photo pickers return an empty FileList through a WebView's
  // multi-select file input, so a photo could be picked and confirmed yet
  // never actually arrive here. Tap the button again to add more than one.
  const addPhotos = async (notice: HandoverNoticeDTO, files: File[]) => {
    if (files.length === 0) return;
    setUploadingNoticeId(notice.id);
    try {
      for (const file of files) {
        const compressed = await compressImageForUpload(file, MAX_PHOTO_BYTES);
        await uploadHandoverPhoto(notice.id, compressed);
      }
      await onNoticesChanged();
      showToast("사진을 추가했습니다.");
    } catch (err) {
      console.error("handover photo upload failed", err);
      showToast(err instanceof Error ? err.message : "사진 업로드에 실패했습니다.", true);
    } finally {
      setUploadingNoticeId(null);
    }
  };

  const deletePhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    try {
      await api.deleteHandoverPhoto(photoId);
      await onNoticesChanged();
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const resetForm = () => {
    setFormCategory("");
    setFormReference("");
    setFormBody("");
  };

  const submitNotice = async (event: React.FormEvent) => {
    event.preventDefault();
    const fromName = guestName.trim();
    if (!formCategory || !fromName || !formReference.trim() || !formBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createHandoverNotice({
        noticeDate: todayKey(),
        noticeTime: nowTime(),
        fromName,
        reference: formReference.trim(),
        category: formCategory,
        body: formBody.trim(),
      });
      await onNoticesChanged();
      resetForm();
      setComposeOpen(false);
      showToast("새 인수인계를 표에 추가했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hb-page">
      <main className="hb-main">
        <section className="hb-page-heading">
          <div>
            <p className="hb-eyebrow">Reception Notice</p>
            <h1>인수인계판</h1>
            <p className="hb-heading-note">오늘의 공지와 처리 상태를 한눈에 확인하세요.</p>
          </div>
          {canEdit && (
            <button type="button" className="hb-primary-button" aria-expanded={composeOpen} onClick={() => setComposeOpen((v) => !v)}>
              {composeOpen ? "작성창 닫기" : "+ 인수인계 작성"}
            </button>
          )}
        </section>

        <section className="hb-summary" aria-label="인수인계 현황">
          <article className="hb-summary-card">
            <div><p className="hb-summary-label">전체 Notice</p><p className="hb-summary-number">{counts.total}</p></div>
            <i className="hb-summary-accent" />
          </article>
          <article className="hb-summary-card hb-summary-card--open">
            <div><p className="hb-summary-label">미완료</p><p className="hb-summary-number">{counts.open}</p></div>
            <i className="hb-summary-accent" />
          </article>
          <article className="hb-summary-card hb-summary-card--done">
            <div><p className="hb-summary-label">완료</p><p className="hb-summary-number">{counts.done}</p></div>
            <i className="hb-summary-accent" />
          </article>
        </section>

        <nav className="hb-view-tabs" role="tablist" aria-label="인수인계 보기">
          <button type="button" className={view === "main" ? "hb-view-tab hb-view-tab--active" : "hb-view-tab"} onClick={() => setView("main")}>
            메인보드 <span className="hb-tab-count">{counts.open}</span>
          </button>
          <button type="button" className={view === "all" ? "hb-view-tab hb-view-tab--active" : "hb-view-tab"} onClick={() => setView("all")}>
            전체보기 <span className="hb-tab-count">{counts.total}</span>
          </button>
          {HANDOVER_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={view === category ? "hb-view-tab hb-view-tab--active" : "hb-view-tab"}
              onClick={() => setView(category)}
            >
              {HANDOVER_CATEGORY_LABELS[category]} <span className="hb-tab-count">{counts.byCategory[category]}</span>
            </button>
          ))}
        </nav>

        {composeOpen && canEdit && (
          <section className="hb-compose">
            <div className="hb-compose-head">
              <h2>새 인수인계 작성</h2>
            </div>
            <form onSubmit={submitNotice}>
              <div className="hb-form-grid">
                <label>Date<input type="date" className="hb-auto-field" value={composeNow.date} readOnly tabIndex={-1} /></label>
                <label>Time<input type="time" className="hb-auto-field" value={composeNow.time} readOnly tabIndex={-1} /></label>
                <label>From<input className="hb-auto-field" value={guestName} readOnly tabIndex={-1} /></label>
                <label>
                  구분
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as HandoverCategory)} required>
                    <option value="">선택</option>
                    {HANDOVER_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {HANDOVER_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  이름 · 객실번호 · 예약번호
                  <input
                    value={formReference}
                    maxLength={200}
                    placeholder="예: Kim / 812 / OA-24091"
                    onChange={(e) => setFormReference(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Notice
                  <textarea
                    value={formBody}
                    maxLength={2000}
                    placeholder="다음 근무자가 바로 이해할 수 있도록 작성해주세요."
                    onChange={(e) => setFormBody(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="hb-compose-actions">
                <button type="button" className="hb-secondary-button" onClick={() => setComposeOpen(false)}>
                  취소
                </button>
                <button type="submit" className="hb-primary-button" disabled={submitting}>
                  {submitting ? "등록 중…" : "등록하기"}
                </button>
              </div>
            </form>
          </section>
        )}

        <datalist id="hb-name-suggestions">
          {nameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <section className="hb-board">
          <div className="hb-board-toolbar">
            <div className="hb-board-title">
              <i className="hb-live-dot" />
              <span>{VIEW_TITLES[view]}</span>
            </div>
            <div className="hb-legend">
              <span><i className="hb-key" />미완료</span>
              <span><i className="hb-key hb-key--green" />완료</span>
            </div>
          </div>

          {hasFilters && (
            <div className="hb-filter-status" role="status">
              <span>{dateFilter && `날짜: ${dateFilter} · `}{fromFilter && `작성자: ${fromFilter} · `}{referenceFilter && `검색: ${referenceFilter} · `}{visible.length}건</span>
              <button type="button" className="hb-secondary-button" onClick={() => {
                setDateFilter(""); setFromFilter(""); setReferenceFilter("");
              }}>필터 초기화</button>
            </div>
          )}
          <div className="hb-table-wrap">
            {!loaded ? (
              <div className="hb-empty-state">불러오는 중…</div>
            ) : (
              <table className="hb-table">
                <colgroup>
                  <col className="hb-col-date" /><col className="hb-col-time" /><col className="hb-col-from" />
                  <col className="hb-col-reference" /><col className="hb-col-notice" /><col className="hb-col-done" />
                  <col className="hb-col-completed-by" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <details className="hb-column-filter">
                        <summary onClick={(e) => {
                          e.preventDefault();
                          const details = e.currentTarget.parentElement as HTMLDetailsElement;
                          details.open = true;
                          const input = details.querySelector("input");
                          input?.focus();
                          try { input?.showPicker?.(); } catch { /* Native input remains available. */ }
                        }}>Date {dateFilter ? "●" : "⌄"}</summary>
                        <input type="date" aria-label="Date 날짜 필터" value={dateFilter}
                          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* Native input remains available. */ } }}
                          onChange={(e) => setDateFilter(e.target.value)} />
                      </details>
                    </th>
                    <th>Time</th>
                    <th>
                      <label className="hb-column-filter">From
                        <select aria-label="From 작성자 필터" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)}>
                          <option value="">전체 작성자</option>
                          {authors.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </label>
                    </th>
                    <th>
                      <details className="hb-column-filter">
                        <summary>이름 · 객실번호 · 예약번호 {referenceFilter ? "●" : "⌄"}</summary>
                        <input type="search" aria-label="이름 · 객실번호 · 예약번호 필터" placeholder="이름, 객실번호, 예약번호 검색"
                          value={referenceFilter} onChange={(e) => setReferenceFilter(e.target.value)} />
                      </details>
                    </th><th>Notice</th>
                    <th className="hb-center">✓</th><th>완료자</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && <tr><td colSpan={7} className="hb-empty-state">
                    <strong>표시할 인수인계가 없습니다.</strong>
                    {hasFilters ? "필터를 변경하거나 초기화해주세요." : "다른 카테고리를 선택하거나 전체보기를 확인해주세요."}
                  </td></tr>}
                  {visible.map((notice) => {
                    const [dateMain, dateSub] = formatKoreanDate(notice.noticeDate).split("|");
                    return (
                      <tr key={notice.id} className={notice.isDone ? "hb-row hb-row--completed" : "hb-row"}>
                        {editingId === notice.id && editDraft ? (
                          <>
                            <td data-label="Date">
                              <input
                                type="date"
                                value={editDraft.noticeDate}
                                onChange={(e) => setEditDraft({ ...editDraft, noticeDate: e.target.value })}
                              />
                            </td>
                            <td data-label="Time">
                              <input
                                type="time"
                                value={editDraft.noticeTime}
                                onChange={(e) => setEditDraft({ ...editDraft, noticeTime: e.target.value })}
                              />
                            </td>
                            <td data-label="From">
                              <input
                                list="hb-name-suggestions"
                                value={editDraft.fromName}
                                maxLength={60}
                                onChange={(e) => setEditDraft({ ...editDraft, fromName: e.target.value })}
                              />
                            </td>
                            <td data-label="이름 · 객실 · 예약">
                              <input
                                value={editDraft.reference}
                                maxLength={200}
                                onChange={(e) => setEditDraft({ ...editDraft, reference: e.target.value })}
                              />
                            </td>
                            <td data-label="Notice">
                              <select
                                value={editDraft.category}
                                onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as HandoverCategory })}
                              >
                                {HANDOVER_CATEGORIES.map((category) => (
                                  <option key={category} value={category}>
                                    {HANDOVER_CATEGORY_LABELS[category]}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                className="hb-edit-textarea"
                                value={editDraft.body}
                                maxLength={2000}
                                onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                              />
                              <div className="hb-edit-actions">
                                <button type="button" className="hb-secondary-button" onClick={cancelEdit}>
                                  취소
                                </button>
                                <button type="button" className="hb-primary-button" disabled={savingEdit} onClick={() => saveEdit(notice)}>
                                  {savingEdit ? "저장 중…" : "저장"}
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td data-label="Date">
                              <span className="hb-date-main">{dateMain}</span>
                              {dateSub && <span className="hb-date-sub">{dateSub}</span>}
                            </td>
                            <td data-label="Time"><span className="hb-time-main">{notice.noticeTime}</span></td>
                            <td data-label="From"><span className="hb-from-badge">{notice.fromName}</span></td>
                            <td data-label="이름 · 객실 · 예약"><span className="hb-reference-main">{notice.reference}</span></td>
                            <td data-label="Notice">
                              <div className="hb-notice-head">
                                <span className={`hb-notice-tag hb-notice-tag--${notice.category}`}>{HANDOVER_CATEGORY_LABELS[notice.category]}</span>
                                {canEdit && (
                                  <div className="hb-notice-actions">
                                    <button type="button" className="hb-notice-edit" title="수정" aria-label="인수인계 수정" onClick={() => startEdit(notice)}>
                                      ✎
                                    </button>
                                    <button
                                      type="button"
                                      className="hb-notice-delete"
                                      title="삭제"
                                      aria-label="인수인계 삭제"
                                      disabled={deletingId === notice.id}
                                      onClick={() => deleteNotice(notice)}
                                    >
                                      🗑
                                    </button>
                                  </div>
                                )}
                              </div>
                              <p className="hb-notice-text">{notice.body}</p>
                              <div className="hb-photo-row">
                            {notice.photos.map((photo) => (
                              <div key={photo.id} className="hb-photo-thumb-wrap">
                                <a href={photo.url} target="_blank" rel="noopener noreferrer">
                                  <PhotoThumb fileName={photo.fileName} url={photo.url} thumbnailUrl={photo.thumbnailUrl} />
                                </a>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className="hb-photo-remove"
                                    aria-label="사진 삭제"
                                    disabled={deletingPhotoId === photo.id}
                                    onClick={() => deletePhoto(photo.id)}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  className="hb-photo-add-btn"
                                  disabled={uploadingNoticeId === notice.id}
                                  onClick={() => {
                                    showToast("사진 선택 창을 엽니다…");
                                    document.getElementById(`hb-photo-input-${notice.id}`)?.click();
                                  }}
                                >
                                  {uploadingNoticeId === notice.id ? "업로드 중…" : "📷 사진 추가"}
                                </button>
                                <input
                                  id={`hb-photo-input-${notice.id}`}
                                  type="file"
                                  accept="image/*"
                                  className="hb-photo-input"
                                  disabled={uploadingNoticeId === notice.id}
                                  onChange={(e) => {
                                    // Copy the FileList into a plain array before touching
                                    // e.target.value — resetting the input's value to allow
                                    // re-selecting the same file also clears its live
                                    // FileList in some Android browsers, and addPhotos is
                                    // async, so it would otherwise see an empty selection by
                                    // the time it actually ran.
                                    const selected = e.target.files ? Array.from(e.target.files) : [];
                                    e.target.value = "";
                                    showToast(selected.length > 0 ? `${selected.length}장 선택됨, 업로드를 시작합니다…` : "선택된 사진이 없습니다.");
                                    addPhotos(notice, selected);
                                  }}
                                />
                              </>
                            )}
                              </div>
                              <div className="hb-comment-list">
                                {notice.comments.map((comment) => (
                                  <div key={comment.id} className="hb-comment">
                                    <span className="hb-comment-author">{comment.authorName}</span>
                                    <span className="hb-comment-body">{comment.body}</span>
                                  </div>
                                ))}
                              </div>
                              {canEdit && (
                                <div className="hb-comment-form">
                                  <textarea
                                    className="hb-comment-input"
                                    rows={1}
                                    placeholder="댓글 남기기… (Shift+Enter로 줄바꿈)"
                                    maxLength={2000}
                                    value={commentDrafts[notice.id] ?? ""}
                                    onChange={(e) => setCommentDrafts((current) => ({ ...current, [notice.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        submitComment(notice);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="hb-secondary-button"
                                    disabled={postingCommentId === notice.id || !(commentDrafts[notice.id] ?? "").trim()}
                                    onClick={() => submitComment(notice)}
                                  >
                                    등록
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                        {notice.category === "everyone" ? (
                          <td className="hb-ack-cell" data-label="확인" colSpan={2}>
                            <div className="hb-ack-grid">
                              {ackRoster.map((name) => {
                                const acked = notice.acks.includes(name);
                                return (
                                  <label key={name} className={acked ? "hb-ack-item hb-ack-item--acked" : "hb-ack-item"}>
                                    <span className="hb-ack-name">{name}</span>
                                    <input
                                      type="checkbox"
                                      checked={acked}
                                      disabled={!canEdit || busyId === notice.id}
                                      onChange={(e) => toggleAck(notice, name, e.target.checked)}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="hb-done-cell" data-label="완료">
                              <label className="hb-check-wrap" aria-label="완료 표시">
                                <input
                                  type="checkbox"
                                  className="hb-done-check"
                                  checked={notice.isDone}
                                  disabled={!canEdit || busyId === notice.id}
                                  onChange={(e) => toggleDone(notice, e.target.checked)}
                                />
                              </label>
                            </td>
                            <td data-label="완료자">
                              <input
                                className="hb-completer-input"
                                list="hb-name-suggestions"
                                aria-label="완료자"
                                value={completerFor(notice)}
                                disabled={!canEdit || notice.isDone}
                                placeholder="이름 입력"
                                maxLength={60}
                                onChange={(e) => setDraftCompleter((current) => ({ ...current, [notice.id]: e.target.value }))}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="hb-board-foot">완료자를 먼저 선택한 뒤 체크해주세요. 완료된 항목은 메인보드에서 사라지고 전체보기와 카테고리 화면에 보관됩니다.</div>
        </section>
      </main>

      <div className={toast ? "hb-toast hb-toast--show" : "hb-toast"} role="status" aria-live="polite">
        <span>{toast?.text}</span>
        {toast?.sticky && (
          <button type="button" className="hb-toast-close" aria-label="닫기" onClick={() => setToast(null)}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
