import { useEffect, useRef, useState } from "react";
import type { AiAnswer, AiStatus } from "@shared/ai";
import { ApiClientError, api } from "@/lib/api";

export function WegoinnAiPanel({ open }: { open: boolean }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void api.aiStatus().then((next) => {
      if (active) setStatus(next);
    }).catch((cause) => {
      if (active) setError(cause instanceof ApiClientError ? cause.message : "AI 상태를 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [open]);

  const ask = async () => {
    const text = question.trim();
    if (!text || busy || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(await api.aiAsk(text));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "답변을 불러오지 못했습니다.");
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  };

  if (!open) return null;
  const ready = !!status?.configured && !!status?.pricing && (status?.budget.remaining ?? 0) > 0;
  return (
    <aside id="wdb-ai-panel" className="wdb-ai-panel" aria-label="Wegoinn DB 자료 질문">
      <p className="wdb-ai-panel__intro">저장된 전체 노트와 첨부 자료에서 근거를 찾아 답합니다.</p>
      {status && !status.configured && <p className="wdb-ai-panel__notice" role="status">AI 키가 아직 설정되지 않았습니다.</p>}
      {status && !status.pricing && <p className="wdb-ai-panel__notice" role="status">가격 설정을 확인할 수 없어 질문을 보류합니다.</p>}
      {status && status.inventory.ready < status.inventory.total && <p className="wdb-ai-panel__notice" role="status">자료 {status.inventory.ready}/{status.inventory.total}개가 준비되었습니다. 답변이 일부 자료만 반영할 수 있습니다.</p>}
      <form className="wdb-ai-panel__form" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <label htmlFor="wdb-ai-question">WEGOINN DB에 질문</label>
        <textarea id="wdb-ai-question" rows={2} maxLength={2000} value={question} disabled={busy} onChange={(event) => setQuestion(event.target.value)} placeholder="예: 카드키 분실 비용이 자료마다 다른가요?" />
        <button type="submit" disabled={!question.trim() || !ready || busy}>{busy ? "자료 확인 중…" : "질문하기"}</button>
      </form>
      {error && <p className="wdb-ai-panel__notice" role="alert">{error}</p>}
      {answer && <div className="wdb-ai-panel__answer" aria-live="polite">
        <p className="wdb-ai-panel__coverage">{answer.coverage.notice}</p>
        {answer.message && <p>{answer.message}</p>}
        {answer.claims.map((claim, index) => <article key={index}>
          <strong>{claim.kind === "conflict" ? "자료 간 불일치" : claim.kind === "uncertain" ? "확인 필요" : "답변"}</strong>
          <p>{claim.text}</p>
          {claim.citations.map((citation, citationIndex) => {
            const source = answer.sources.find((item) => item.id === citation.id);
            return source && <details key={citationIndex}>
              <summary>{source.title} · {source.location}</summary>
              <blockquote>{citation.quote}</blockquote>
              <a href={source.url} target="_blank" rel="noreferrer">원본 보기</a>
            </details>;
          })}
        </article>)}
        {answer.calculations.map((calculation, index) => <article key={`calculation-${index}`}>
          <strong>{calculation.label}: {calculation.result} {calculation.unit}</strong>
          <p>{calculation.scope}</p>
        </article>)}
        {answer.missing.length > 0 && <p className="wdb-ai-panel__notice">질문의 일부는 저장된 자료에서 확인할 수 없습니다.</p>}
      </div>}
    </aside>
  );
}
