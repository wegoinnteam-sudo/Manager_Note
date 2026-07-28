import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentDTO, PageDetailDTO, PageSummaryDTO, TeamMemberDTO } from "@shared/types";
import { api, ApiClientError } from "@/lib/api";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Editor, type EditorHandle } from "./Editor";
import { Comments } from "@/features/comments/Comments";
import { History } from "@/features/history/History";
import { HandoffTools } from "./HandoffTools";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export function PageView({
  pageId,
  canEdit,
  canDelete,
  members,
  autoFocusTitle,
  onConsumedAutoFocus,
  registerFileDropHandler,
  onDeleted,
  onPagesChanged,
  onOpenPage,
  pages,
}: {
  pageId: string;
  canEdit: boolean;
  canDelete: boolean;
  members: TeamMemberDTO[];
  autoFocusTitle: boolean;
  onConsumedAutoFocus: () => void;
  registerFileDropHandler: (handler: (files: FileList) => void) => void;
  onDeleted: () => void;
  onPagesChanged: () => void;
  onOpenPage: (pageId: string) => void;
  pages: PageSummaryDTO[];
}) {
  const [page, setPage] = useState<PageDetailDTO | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const loadedPageId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [detail, { attachments: rows }] = await Promise.all([api.getPage(pageId), api.listAttachments(pageId)]);
    setPage(detail);
    setAttachments(rows);
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
        setPage(updated);
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
        setPage(updated);
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

  return (
    <div className="page-shell">
      <div className="page-view">
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
            debouncedSaveTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
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
            debouncedSaveContent(content);
          }}
          onOpenPage={onOpenPage}
          onPagesChanged={onPagesChanged}
          onAttachmentUploaded={(a) => setAttachments((prev) => [...prev, a])}
          pages={pages}
          members={members}
          registerFileDropHandler={registerFileDropHandler}
        />

        <Comments pageId={page.id} canComment={canEdit} />
        <History pageId={page.id} members={members} />

        {canDelete && (
          <div style={{ marginTop: 24 }}>
            <button type="button" onClick={handleDelete} style={{ fontSize: 12, color: "var(--color-danger)", background: "none", border: "1px solid var(--color-danger)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              페이지 삭제
            </button>
          </div>
        )}
      </div>

      <aside className="page-side">
        <div className="page-side__label">참고</div>
        <HandoffTools pageId={page.id} content={page.contentJson} onQuestionsChanged={onPagesChanged} />
      </aside>
    </div>
  );
}
