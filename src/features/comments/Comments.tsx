import { useCallback, useEffect, useState } from "react";
import type { CommentDTO } from "@shared/types";
import { api } from "@/lib/api";

export function Comments({ pageId, canComment, guestName }: { pageId: string; canComment: boolean; guestName?: string }) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const { comments: rows } = await api.listComments(pageId);
    setComments(rows);
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async () => {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await api.createComment(pageId, draft.trim(), guestName);
      setDraft("");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="section">
      <div className="section__title">댓글</div>
      {comments.map((c) => (
        <div className="comment" key={c.id}>
          <div className="comment__meta">
            {c.authorName} · {new Date(c.createdAt).toLocaleString("ko-KR")}
          </div>
          <div>{c.body}</div>
        </div>
      ))}
      {canComment && (
        <div className="comment-form">
          <textarea className="comment-input" aria-label="댓글" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="댓글을 입력하세요" />
          <button type="button" className="page-btn" disabled={submitting || !draft.trim()} onClick={submit}>
            {submitting ? "등록 중…" : "댓글 등록"}
          </button>
        </div>
      )}
    </div>
  );
}
