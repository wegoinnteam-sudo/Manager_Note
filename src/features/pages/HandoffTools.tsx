import { useCallback, useEffect, useMemo, useState } from "react";
import type { InlineQuestionDTO, PageContent } from "@shared/types";
import { api } from "@/lib/api";

type Section = { id: string; label: string; level: number };

function sectionsFromContent(content: PageContent): Section[] {
  return content.blocks.flatMap((block) => {
    if (!["heading1", "heading2", "heading3"].includes(block.type) || !("text" in block) || !block.text.trim()) return [];
    return [{ id: block.id, label: block.text.trim(), level: Number(block.type.slice(-1)) }];
  });
}

function goToBlock(blockId: string | null) {
  if (!blockId) return;
  document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function HandoffTools({
  pageId,
  content,
  onQuestionsChanged,
}: {
  pageId: string;
  content: PageContent;
  onQuestionsChanged: () => void;
}) {
  const sections = useMemo(() => sectionsFromContent(content), [content]);
  const [onboardingOpen, setOnboardingOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<InlineQuestionDTO[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshQuestions = useCallback(async () => {
    const result = await api.listQuestions(pageId);
    setQuestions(result.questions);
  }, [pageId]);

  useEffect(() => {
    Promise.all([api.getOnboardingProgress(pageId), api.listQuestions(pageId)]).then(([progress, result]) => {
      setCompleted(new Set(progress.completedBlockIds));
      setQuestions(result.questions);
    });
  }, [pageId]);

  const toggleProgress = async (blockId: string) => {
    const nextValue = !completed.has(blockId);
    setCompleted((current) => {
      const next = new Set(current);
      nextValue ? next.add(blockId) : next.delete(blockId);
      return next;
    });
    try {
      await api.setOnboardingProgress(pageId, blockId, nextValue);
    } catch {
      setCompleted((current) => {
        const next = new Set(current);
        nextValue ? next.delete(blockId) : next.add(blockId);
        return next;
      });
    }
  };

  const submitQuestion = async () => {
    if (!draft.trim()) return;
    const section = sections.find((candidate) => candidate.id === selectedBlockId);
    setSubmitting(true);
    try {
      await api.createQuestion(pageId, {
        body: draft.trim(),
        blockId: section?.id ?? null,
        blockLabel: section?.label ?? "페이지 전체",
      });
      setDraft("");
      await refreshQuestions();
      onQuestionsChanged();
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = questions.filter((question) => question.status === "open").length;
  const completedCount = sections.filter((section) => completed.has(section.id)).length;
  const percentage = sections.length ? Math.round((completedCount / sections.length) * 100) : 0;

  return (
    <div className="handoff-tools">
      <section className="handoff-card">
        <button type="button" className="handoff-card__header" onClick={() => setOnboardingOpen((value) => !value)}>
          <span>🧭 신규 담당자 온보딩</span>
          <span className="handoff-card__summary">{completedCount}/{sections.length} 완료 · {percentage}% {onboardingOpen ? "▴" : "▾"}</span>
        </button>
        {onboardingOpen && (
          <div className="handoff-card__body">
            {sections.length === 0 ? (
              <div className="handoff-empty">페이지에 제목1·제목2·제목3을 추가하면 읽기 순서가 자동으로 만들어집니다.</div>
            ) : (
              <>
                <div className="onboarding-progress"><span style={{ width: `${percentage}%` }} /></div>
                <div className="onboarding-list">
                  {sections.map((section, index) => (
                    <label className="onboarding-item" key={section.id} style={{ paddingLeft: 8 + (section.level - 1) * 14 }}>
                      <input type="checkbox" checked={completed.has(section.id)} onChange={() => toggleProgress(section.id)} />
                      <button type="button" onClick={() => goToBlock(section.id)}>
                        <span>{index + 1}.</span> {section.label}
                      </button>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="handoff-card">
        <button type="button" className="handoff-card__header" onClick={() => setQuestionsOpen((value) => !value)}>
          <span>❓ 인라인 질문</span>
          <span className={`question-count${openCount ? " question-count--open" : ""}`}>
            미해결 {openCount} {questionsOpen ? "▴" : "▾"}
          </span>
        </button>
        {questionsOpen && (
          <div className="handoff-card__body">
            <div className="question-compose">
              <select value={selectedBlockId} onChange={(event) => setSelectedBlockId(event.target.value)}>
                <option value="">페이지 전체에 질문</option>
                {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
              </select>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="이해되지 않는 내용을 질문하세요. 팀에 미해결 질문으로 표시됩니다."
              />
              <button type="button" disabled={submitting || !draft.trim()} onClick={submitQuestion}>질문 남기기</button>
            </div>

            <div className="question-list">
              {questions.length === 0 && <div className="handoff-empty">아직 등록된 질문이 없습니다.</div>}
              {questions.map((question) => (
                <article className={`question-item question-item--${question.status}`} key={question.id}>
                  <div className="question-item__top">
                    <button type="button" className="question-item__anchor" onClick={() => goToBlock(question.blockId)}>
                      {question.blockLabel || "페이지 전체"}
                    </button>
                    <span>{question.status === "open" ? "미해결" : "해결됨"}</span>
                  </div>
                  <div className="question-item__body">{question.body}</div>
                  <div className="question-item__meta">
                    {question.authorName} · {new Date(question.createdAt).toLocaleString("ko-KR")}
                    {question.resolvedByName ? ` · ${question.resolvedByName}님이 해결` : ""}
                  </div>
                  <button
                    type="button"
                    className="question-item__resolve"
                    onClick={async () => {
                      await api.setQuestionResolved(pageId, question.id, question.status === "open");
                      await refreshQuestions();
                      onQuestionsChanged();
                    }}
                  >
                    {question.status === "open" ? "해결됨으로 표시" : "다시 열기"}
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
