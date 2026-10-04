import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import "./cancellations.css";
import type { CancellationFilters, CancellationRecord, RateFilter, SortKey, SortState } from "./types";
import {
  EMPTY_FILTERS,
  filterCancellations,
  formatDateTime,
  isFullCancellation,
  managerColor,
  managerNames,
  rateLabel,
  sortCancellations,
  summarize,
  toExportRows,
} from "./cancellationUtils";
import { MOCK_CANCELLATIONS } from "./mockCancellations";
import { useCancellations } from "./useCancellations";

const PAGE_SIZES = [10, 20, 50];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / older WebViews without the async clipboard API.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function RateBadge({ record }: { record: CancellationRecord }) {
  return (
    <span className={isFullCancellation(record) ? "cx-badge cx-badge--full" : "cx-badge cx-badge--partial"}>
      {rateLabel(record)}
    </span>
  );
}

function ManagerBadge({ name }: { name: string }) {
  if (!name) return <span className="cx-muted">-</span>;
  const color = managerColor(name);
  return (
    <span className="cx-badge cx-badge--manager" style={{ background: color.background, color: color.text }}>
      {name}
    </span>
  );
}

function CopyButton({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: (value: string) => void }) {
  return (
    <button
      type="button"
      className={copied ? "cx-copy cx-copy--done" : "cx-copy"}
      onClick={(e) => {
        e.stopPropagation();
        onCopy(value);
      }}
      aria-label={`예약번호 ${value} 복사`}
      title="예약번호 복사"
    >
      {copied ? "복사됨" : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return (
    <button type="button" className={active ? "cx-sort cx-sort--active" : "cx-sort"} onClick={() => onSort(sortKey)}>
      {label}
      <span aria-hidden="true">{active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function RowMenu({ onDetail, onCopy }: { onDetail: () => void; onCopy: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="cx-menu" ref={ref}>
      <button type="button" className="cx-menu__trigger" aria-label="더보기" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open && (
        <div className="cx-menu__list" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDetail(); }}>상세보기</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onCopy(); }}>예약번호 복사</button>
        </div>
      )}
    </div>
  );
}

function Reason({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  if (!text || text === "-") return <span className="cx-muted">-</span>;
  return (
    <button type="button" className={expanded ? "cx-reason cx-reason--open" : "cx-reason"} title={text} onClick={onToggle}>
      {text}
    </button>
  );
}

export function CancellationBoard() {
  const live = useCancellations();
  const [sampleMode, setSampleMode] = useState(false);
  // Sample rows are display-only and never mixed with real ones: if any
  // real data exists the sample toggle isn't offered at all.
  const records = sampleMode && live.records.length === 0 ? MOCK_CANCELLATIONS : live.records;

  const [filters, setFilters] = useState<CancellationFilters>(EMPTY_FILTERS);
  const [queryDraft, setQueryDraft] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "cancelDate", dir: "desc" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<CancellationRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const copyTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const summary = useMemo(() => summarize(records), [records]);
  const managers = useMemo(() => managerNames(records), [records]);
  const visible = useMemo(() => sortCancellations(filterCancellations(records, filters), sort), [records, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = visible.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) || queryDraft !== "";

  const updateFilters = (patch: Partial<CancellationFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const runSearch = () => updateFilters({ query: queryDraft });
  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setQueryDraft("");
    setPage(1);
  };
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const onCopy = async (recordId: string, value: string) => {
    if (!(await copyText(value))) return;
    setCopiedId(recordId);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleReason = (id: string) =>
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(toExportRows(visible));
      sheet["!cols"] = [6, 12, 14, 18, 12, 14, 12, 40, 18].map((wch) => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "무료취소내역");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(book, `무료취소내역_${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const hasRecords = records.length > 0;

  return (
    <div className="cx-page">
      <div className="cx-main">
        <header className="cx-heading">
          <div>
            <h1>예약 무료 취소내역</h1>
            <p>예약 무료 취소 승인 내역을 관리하는 페이지입니다.</p>
          </div>
          {sampleMode && (
            <div className="cx-sample-flag">
              <span>샘플 데이터 · 저장되지 않음</span>
              <button type="button" onClick={() => { setSampleMode(false); reset(); }}>샘플 끄기</button>
            </div>
          )}
        </header>

        <section className="cx-summary" aria-label="요약">
          <div className="cx-card">
            <span className="cx-card__label">전체 취소 건수</span>
            <strong className="cx-card__value">{summary.total}<small>건</small></strong>
          </div>
          <div className="cx-card">
            <span className="cx-card__label">100% 취소</span>
            <strong className="cx-card__value">{summary.full}<small>건</small></strong>
          </div>
          <div className="cx-card">
            <span className="cx-card__label">담당자</span>
            <strong className="cx-card__value">{summary.managerCount}<small>명</small></strong>
          </div>
          <div className="cx-card">
            <span className="cx-card__label">가장 최근 취소</span>
            <strong className="cx-card__value cx-card__value--date">{summary.latestCancelDate ?? "-"}</strong>
          </div>
        </section>

        <section className="cx-panel">
          <div className="cx-toolbar" role="search">
            <label className="cx-field">
              <span>취소날짜</span>
              <div className="cx-range">
                <input type="date" aria-label="취소날짜 시작일" value={filters.from} max={filters.to || undefined}
                  onChange={(e) => updateFilters({ from: e.target.value })} />
                <span aria-hidden="true">~</span>
                <input type="date" aria-label="취소날짜 종료일" value={filters.to} min={filters.from || undefined}
                  onChange={(e) => updateFilters({ to: e.target.value })} />
              </div>
            </label>
            <label className="cx-field">
              <span>담당자</span>
              <select value={filters.manager} onChange={(e) => updateFilters({ manager: e.target.value })}>
                <option value="">전체</option>
                {managers.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="cx-field">
              <span>취소율</span>
              <select value={filters.rate} onChange={(e) => updateFilters({ rate: e.target.value as RateFilter })}>
                <option value="all">전체</option>
                <option value="full">100%</option>
                <option value="partial">부분취소</option>
              </select>
            </label>
            <label className="cx-field cx-field--grow">
              <span>검색</span>
              <input type="search" placeholder="예약번호 또는 성함으로 검색" value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} />
            </label>
            <div className="cx-toolbar__actions">
              <button type="button" className="cx-btn cx-btn--primary" onClick={runSearch}>검색</button>
              <button type="button" className="cx-btn" onClick={reset} disabled={!filtersActive}>초기화</button>
              <button type="button" className="cx-btn" onClick={exportExcel} disabled={visible.length === 0 || exporting}>
                {exporting ? "내보내는 중…" : "엑셀 다운로드"}
              </button>
            </div>
          </div>

          {!hasRecords ? (
            <div className="cx-empty">
              <strong>등록된 무료 취소내역이 없습니다.</strong>
              <p>무료 취소 승인 내역이 등록되면 이곳에 표시됩니다.</p>
              {!live.connected && (
                <button type="button" className="cx-btn" onClick={() => setSampleMode(true)}>샘플 데이터로 미리보기</button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="cx-empty">
              <strong>조건에 맞는 취소내역이 없습니다.</strong>
              <p>검색어나 필터를 바꾸거나 초기화해 보세요.</p>
              <button type="button" className="cx-btn" onClick={reset}>초기화</button>
            </div>
          ) : (
            <>
              <div className="cx-table-wrap">
                <table className="cx-table">
                  <colgroup>
                    <col style={{ width: 60 }} />
                    <col style={{ width: 124 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 132 }} />
                    <col style={{ width: 128 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ minWidth: 260 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 48 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th><SortHeader label="취소날짜" sortKey="cancelDate" sort={sort} onSort={onSort} /></th>
                      <th>예약번호</th>
                      <th>성함</th>
                      <th><SortHeader label="체크인 날짜" sortKey="checkInDate" sort={sort} onSort={onSort} /></th>
                      <th><SortHeader label="취소율" sortKey="cancellationRate" sort={sort} onSort={onSort} /></th>
                      <th>담당자</th>
                      <th>사유</th>
                      <th><SortHeader label="등록일" sortKey="createdAt" sort={sort} onSort={onSort} /></th>
                      <th aria-label="메뉴" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={r.id}>
                        <td className="cx-muted">{start + i + 1}</td>
                        <td>{r.cancelDate}</td>
                        <td>
                          <span className="cx-resno">
                            <span>{r.reservationNumber}</span>
                            <CopyButton value={r.reservationNumber} copied={copiedId === r.id} onCopy={(v) => onCopy(r.id, v)} />
                          </span>
                        </td>
                        <td className="cx-strong">{r.guestName}</td>
                        <td>{r.checkInDate}</td>
                        <td><RateBadge record={r} /></td>
                        <td><ManagerBadge name={r.manager} /></td>
                        <td><Reason text={r.reason} expanded={expandedReasons.has(r.id)} onToggle={() => toggleReason(r.id)} /></td>
                        <td className="cx-muted">{formatDateTime(r.createdAt)}</td>
                        <td><RowMenu onDetail={() => setDetail(r)} onCopy={() => onCopy(r.id, r.reservationNumber)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="cx-cards">
                {pageRows.map((r) => (
                  <li key={r.id} className="cx-mcard">
                    <div className="cx-mcard__top">
                      <span className="cx-resno">
                        <span>{r.reservationNumber}</span>
                        <CopyButton value={r.reservationNumber} copied={copiedId === r.id} onCopy={(v) => onCopy(r.id, v)} />
                      </span>
                      <RateBadge record={r} />
                    </div>
                    <div className="cx-mcard__name">{r.guestName}</div>
                    <dl>
                      <dt>취소날짜</dt><dd>{r.cancelDate}</dd>
                      <dt>체크인</dt><dd>{r.checkInDate}</dd>
                      <dt>담당자</dt><dd><ManagerBadge name={r.manager} /></dd>
                      <dt>사유</dt><dd><Reason text={r.reason} expanded={expandedReasons.has(r.id)} onToggle={() => toggleReason(r.id)} /></dd>
                      <dt>등록일</dt><dd>{formatDateTime(r.createdAt)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>

              <footer className="cx-pager">
                <label className="cx-pager__size">
                  페이지당
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}개</option>)}
                  </select>
                </label>
                <span className="cx-pager__count">
                  총 {visible.length}건 중 {start + 1}-{start + pageRows.length}건
                </span>
                {pageCount > 1 && (
                  <nav className="cx-pager__pages" aria-label="페이지">
                    <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="이전 페이지">‹</button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" className={n === currentPage ? "cx-pager__current" : undefined}
                        aria-current={n === currentPage ? "page" : undefined} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="다음 페이지">›</button>
                  </nav>
                )}
              </footer>
            </>
          )}
        </section>
      </div>

      {detail && (
        <Modal title={`취소내역 · ${detail.reservationNumber}`} onClose={() => setDetail(null)}>
          <dl className="cx-detail">
            <dt>취소날짜</dt><dd>{detail.cancelDate}</dd>
            <dt>예약번호</dt><dd>{detail.reservationNumber}</dd>
            <dt>성함</dt><dd>{detail.guestName}</dd>
            <dt>체크인 날짜</dt><dd>{detail.checkInDate}</dd>
            <dt>취소율</dt><dd><RateBadge record={detail} /></dd>
            <dt>담당자</dt><dd><ManagerBadge name={detail.manager} /></dd>
            <dt>사유</dt><dd className="cx-detail__reason">{detail.reason || "-"}</dd>
            <dt>등록일</dt><dd>{formatDateTime(detail.createdAt)}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}
