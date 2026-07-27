import { useCallback, useEffect, useState } from "react";
import type { CommentDTO } from "@shared/types";
import { api } from "@/lib/api";

export function Comments({ pageId, canComment }: { pageId: string; canComment: boolean }) {
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
      await api.createComment(pageId, draft.trim());
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
        <div style={{ marginTop: 10 }}>
          <textarea className="comment-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="댓글을 입력하세요" />
          <button
            type="button"
            disabled={submitting || !draft.trim()}
            onClick={submit}
            style={{ marginTop: 6, fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}
          >
            등록
          </button>
        </div>
      )}
    </div>
  );
}
