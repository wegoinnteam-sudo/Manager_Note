import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentDTO, PageDetailDTO, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import { api, ApiClientError } from "@/lib/api";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Editor, type EditorHandle } from "./Editor";
import { Comments } from "@/features/comments/Comments";
import { History } from "@/features/history/History";
import { HandoffTools } from "./HandoffTools";
import type { PresenceUser } from "@/hooks/usePresence";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
const REFERENCE_WIDTH_KEY = "th_reference_panel_width";
const REFERENCE_POSITION_KEY = "th_reference_panel_position";
const REFERENCE_COLLAPSED_KEY = "th_reference_panel_collapsed";
const OFFLINE_KEY_PREFIX = "th_offline_page_";

interface ReferencePosition {
  x: number;
  y: number;
}

export function PageView({
  pageId,
  canEdit,
  canDelete,
  members,
  guestColors,
  autoFocusTitle,
  onConsumedAutoFocus,
  registerFileDropHandler,
  onDeleted,
  onPagesChanged,
  onOpenPage,
  onPeekPage,
  pages,
  presenceUsers,
  onCursorReport,
  guestName,
  canViewSensitive,
  autoSave = true,
}: {
  pageId: string;
  canEdit: boolean;
  canDelete: boolean;
  members: TeamMemberDTO[];
  guestColors: Record<string, string>;
  autoFocusTitle: boolean;
  onConsumedAutoFocus: () => void;
  registerFileDropHandler: (handler: (files: FileList) => void) => void;
  onDeleted: () => void;
  onPagesChanged: () => void;
  onOpenPage: (pageId: string) => void;
  onPeekPage: (pageId: string, label?: string, anchorLeft?: number) => void;
  pages: PageSummaryDTO[];
  presenceUsers: PresenceUser[];
  onCursorReport: (blockId: string | null, offset: number) => void;
  guestName?: string;
  canViewSensitive: boolean;
  // When false, edits are held locally and only sent to the server when the
  // user presses the Save button — used for the calendar date peek panel,
  // where clicking elsewhere should not silently persist changes.
  autoSave?: boolean;
}) {
  const [page, setPage] = useState<PageDetailDTO | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [referenceWidth, setReferenceWidth] = useState(() => {
    const saved = Number(localStorage.getItem(REFERENCE_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= 200 && saved <= 520 ? saved : 260;
  });
  const [referencePosition, setReferencePosition] = useState<ReferencePosition>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REFERENCE_POSITION_KEY) ?? "") as ReferencePosition;
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
    } catch {
      // Use the default position when there is no saved location yet.
    }
    return { x: Math.max(16, window.innerWidth - 300), y: 64 };
  });
  const [referenceCollapsed, setReferenceCollapsed] = useState(
    () => localStorage.getItem(REFERENCE_COLLAPSED_KEY) === "1",
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const referencePanelRef = useRef<HTMLElement>(null);
  const loadedPageId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, { attachments: rows }] = await Promise.all([api.getPage(pageId), api.listAttachments(pageId)]);
      setPage(detail);
      setAttachments(rows);
      const offlineKey = `${OFFLINE_KEY_PREFIX}${pageId}`;
      if (localStorage.getItem(offlineKey)) {
        localStorage.setItem(offlineKey, JSON.stringify({ savedAt: new Date().toISOString(), page: detail }));
      }
    } catch (error) {
      const cached = localStorage.getItem(`${OFFLINE_KEY_PREFIX}${pageId}`);
      if (!cached) throw error;
      const parsed = JSON.parse(cached) as { page?: PageDetailDTO };
      if (!parsed.page) throw error;
      setPage(parsed.page);
      setAttachments([]);
      setSaveState("error");
    }
  }, [pageId]);

  useEffect(() => {
    setPage(null);
    load();
  }, [load]);

  useEffect(() => {
    if (page && autoFocusTitle && loadedPageId.current !== page.id) {
      loadedPageId.current = page.id;
      titleRef.current?.focus();
      titleRef.current?.select();
      onConsumedAutoFocus();
    }
  }, [page, autoFocusTitle, onConsumedAutoFocus]);

  const saveMeta = useCallback(
    async (patch: Omit<Parameters<typeof api.updatePageMeta>[1], "expectedVersion">) => {
      if (!page) return;
      setSaveState("saving");
      try {
        const updated = await api.updatePageMeta(page.id, { expectedVersion: page.version, ...patch });
        // Local state already has whatever we just sent (applied optimistically
        // at input time), possibly plus even newer edits typed during this
        // request's round trip. Only take version/timestamp bookkeeping from the
        // response — re-applying the echoed patch would revert those newer edits.
        setPage((current) =>
          current && current.id === updated.id
            ? { ...current, version: updated.version, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy }
            : current,
        );
        setSaveState("saved");
        onPagesChanged();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setSaveState("conflict");
        } else {
          setSaveState("error");
        }
      }
    },
    [page, onPagesChanged],
  );

  const debouncedSaveTitle = useDebouncedCallback((title: string) => saveMeta({ title }), 800);

  const saveContent = useCallback(
    async (content: PageDetailDTO["contentJson"]) => {
      if (!page) return;
      setSaveState("saving");
      try {
        const updated = await api.updatePageContent(page.id, page.contentVersion, content);
        // Same reasoning as saveMeta: only take the version/timestamp bookkeeping
        // from the response, never overwrite contentJson with the (possibly
        // now-stale) echo — the user may have kept typing during the round trip.
        setPage((current) =>
          current && current.id === updated.id
            ? { ...current, contentVersion: updated.contentVersion, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy }
            : current,
        );
        setSaveState("saved");
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setSaveState("conflict");
        } else {
          setSaveState("error");
        }
      }
    },
    [page],
  );
  const debouncedSaveContent = useDebouncedCallback(saveContent, 1000);

  const saveNow = useCallback(() => {
    if (!page) return;
    debouncedSaveTitle.cancel();
    debouncedSaveContent.cancel();
    void Promise.all([saveMeta({ title: page.title }), saveContent(page.contentJson)]);
  }, [page, debouncedSaveTitle, debouncedSaveContent, saveMeta, saveContent]);

  useEffect(() => {
    if (!canEdit || !page) return;
    const saveImmediately = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      saveNow();
    };
    window.addEventListener("keydown", saveImmediately);
    return () => window.removeEventListener("keydown", saveImmediately);
  }, [canEdit, page, saveNow]);

  const clampReferencePosition = useCallback((position: ReferencePosition): ReferencePosition => {
    const panel = referencePanelRef.current;
    const width = panel?.offsetWidth ?? referenceWidth;
    const height = panel?.offsetHeight ?? 300;
    return {
      x: Math.max(0, Math.min(position.x, Math.max(0, window.innerWidth - Math.min(width, window.innerWidth)))),
      y: Math.max(0, Math.min(position.y, Math.max(0, window.innerHeight - Math.min(44, height)))),
    };
  }, [referenceWidth]);

  const startReferenceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = referencePosition;
    const onMove = (moveEvent: PointerEvent) => {
      setReferencePosition(clampReferencePosition({
        x: Math.round(startPosition.x + moveEvent.clientX - startX),
        y: Math.round(startPosition.y + moveEvent.clientY - startY),
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setReferencePosition((current) => {
        localStorage.setItem(REFERENCE_POSITION_KEY, JSON.stringify(current));
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startReferenceResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = referenceWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setReferenceWidth(Math.max(200, Math.min(520, Math.round(startWidth + moveEvent.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setReferenceWidth((current) => {
        localStorage.setItem(REFERENCE_WIDTH_KEY, String(current));
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    const keepReferenceOnScreen = () => setReferencePosition((current) => clampReferencePosition(current));
    window.addEventListener("resize", keepReferenceOnScreen);
    return () => window.removeEventListener("resize", keepReferenceOnScreen);
  }, [clampReferencePosition]);

  const toggleReferenceCollapsed = () => {
    setReferenceCollapsed((current) => {
      const next = !current;
      localStorage.setItem(REFERENCE_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm("이 페이지를 휴지통으로 이동할까요?")) return;
    await api.deletePage(page.id);
    onPagesChanged();
    onDeleted();
  };

  if (!page) {
    return <div className="page-view">불러오는 중…</div>;
  }

  // The calendar already floats as its own draggable panel, so the 참고
  // reference panel would just clutter the screen on top of it — skip it
  // for pages that embed a calendar view.
  const hasCalendarBlock = page.contentJson.blocks.some((b) => b.type === "database_view" && b.view === "calendar");

  return (
    <div className="page-shell">
      <div className="page-view">
        {!autoSave && canEdit && (
          <div className="page-view__manual-save">
            <button type="button" onClick={saveNow} disabled={saveState === "saving"}>
              {saveState === "saving" ? "저장 중…" : "저장"}
            </button>
            <span className="page-view__manual-save-hint">저장 버튼을 눌러야 저장됩니다</span>
          </div>
        )}

        {saveState === "conflict" && (
          <div style={{ background: "var(--color-warn-bg)", border: "1px solid #f59e0b", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
            다른 사용자가 먼저 이 페이지를 수정했습니다.{" "}
            <button type="button" onClick={load} style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer" }}>
              새로고침해서 최신 내용 보기
            </button>
          </div>
        )}

        <input
          ref={titleRef}
          className="page-view__title"
          value={page.title}
          disabled={!canEdit}
          onChange={(e) => {
            setPage({ ...page, title: e.target.value });
            if (autoSave) debouncedSaveTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              e.currentTarget.blur();
              editorRef.current?.focusFirstBlock();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" && document.activeElement === e.currentTarget) {
              e.preventDefault();
              e.currentTarget.blur();
              editorRef.current?.focusFirstBlock();
            }
          }}
          placeholder="제목 없음"
        />

        {saveState === "error" && (
          <div style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 12 }}>
            저장 실패 — 네트워크를 확인하세요
          </div>
        )}

        <Editor
          ref={editorRef}
          pageId={page.id}
          content={page.contentJson}
          attachments={attachments}
          editable={canEdit}
          onChange={(content) => {
            setPage({ ...page, contentJson: content });
            if (autoSave) debouncedSaveContent(content);
          }}
          onOpenPage={onOpenPage}
          onPeekPage={onPeekPage}
          onPagesChanged={onPagesChanged}
          onAttachmentUploaded={(a) => setAttachments((prev) => [...prev, a])}
          pages={pages}
          members={members}
          registerFileDropHandler={registerFileDropHandler}
          presenceUsers={presenceUsers.filter((u) => u.pageId === page.id)}
          onCursorReport={onCursorReport}
          canViewSensitive={canViewSensitive}
          guestName={guestName}
          guestColors={guestColors}
        />

        <Comments pageId={page.id} canComment={canEdit} guestName={guestName} />
        <History pageId={page.id} members={members} />

        {canDelete && (
          <div style={{ marginTop: 24 }}>
            <button type="button" onClick={handleDelete} style={{ fontSize: 12, color: "var(--color-danger)", background: "none", border: "1px solid var(--color-danger)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              페이지 삭제
            </button>
          </div>
        )}
      </div>

      {!hasCalendarBlock && (
        <aside
          ref={referencePanelRef}
          className="page-side"
          style={{ width: referenceWidth, left: referencePosition.x, top: referencePosition.y }}
          onPointerDown={(event) => event.currentTarget.focus()}
          tabIndex={-1}
        >
          {!referenceCollapsed && (
            <button
              type="button"
              className="page-side__resize"
              onPointerDown={startReferenceResize}
              aria-label="참고 패널 너비 조절"
              title="드래그해서 너비 조절"
            />
          )}
          <div className="page-side__header" onPointerDown={startReferenceDrag} title="드래그해서 참고 창 이동">
            <div className="page-side__label">참고</div>
            {!referenceCollapsed && <span className="page-side__drag-hint">이동</span>}
            <button
              type="button"
              className="page-side__collapse"
              onClick={toggleReferenceCollapsed}
              aria-label={referenceCollapsed ? "참고 패널 펼치기" : "참고 패널 접기"}
              title={referenceCollapsed ? "펼치기" : "접기"}
            >
              {referenceCollapsed ? "+" : "−"}
            </button>
          </div>
          {!referenceCollapsed && (
            <div className="page-side__content">
              <HandoffTools pageId={page.id} content={page.contentJson} onQuestionsChanged={onPagesChanged} />
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
