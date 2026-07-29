import { useState } from "react";
import { api, ApiClientError } from "@/lib/api";

export function SecretBlockView({
  pageId,
  blockId,
  label,
  editable,
  canView,
  onLabelChange,
}: {
  pageId: string;
  blockId: string;
  label: string;
  editable: boolean;
  canView: boolean;
  onLabelChange: (label: string) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const [settingValue, setSettingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [copyWarning, setCopyWarning] = useState(false);

  const reveal = async () => {
    if (!window.confirm("민감정보입니다. 확인 시 열람 기록이 감사 로그에 남습니다. 계속하시겠어요?")) return;
    setLoading(true);
    setError(null);
    try {
      const { value } = await api.getSecretValue(pageId, blockId);
      setRevealed(value);
    } catch (err) {
      setError(err instanceof ApiClientError && err.status === 404 ? "아직 값이 설정되지 않았습니다." : "불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const saveValue = async () => {
    if (!valueDraft.trim()) return;
    await api.setSecretValue(pageId, blockId, valueDraft.trim());
    setRevealed(valueDraft.trim());
    setValueDraft("");
    setSettingValue(false);
  };

  const copyValue = async () => {
    if (!revealed) return;
    if (!window.confirm("민감정보를 클립보드에 복사합니다. 외부에 공유되지 않도록 주의하세요.")) return;
    await navigator.clipboard.writeText(revealed);
    setCopyWarning(true);
    setTimeout(() => setCopyWarning(false), 1500);
  };

  return (
    <div className="secret-block">
      <div className="secret-block__header">
        <span className="secret-block__icon">🔒</span>
        {editingLabel ? (
          <input
            className="secret-block__label-input"
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              onLabelChange(labelDraft.trim() || "민감정보");
              setEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setLabelDraft(label);
                setEditingLabel(false);
              }
            }}
          />
        ) : (
          <span
            className="secret-block__label"
            onClick={() => editable && setEditingLabel(true)}
            title={editable ? "클릭해서 이름 수정" : undefined}
          >
            {label || "민감정보"}
          </span>
        )}
      </div>

      {!canView ? (
        <div className="secret-block__denied">권한이 있는 사용자만 열람할 수 있습니다.</div>
      ) : revealed !== null ? (
        <div className="secret-block__value-row">
          <code className="secret-block__value">{revealed}</code>
          <button type="button" onClick={copyValue}>
            {copyWarning ? "복사됨" : "복사"}
          </button>
          <button type="button" onClick={() => setRevealed(null)}>
            숨기기
          </button>
        </div>
      ) : (
        <div className="secret-block__masked-row">
          <span className="secret-block__masked">••••••••</span>
          <button type="button" disabled={loading} onClick={reveal}>
            {loading ? "확인 중…" : "표시"}
          </button>
          {editable && (
            <button type="button" onClick={() => setSettingValue((v) => !v)}>
              값 설정
            </button>
          )}
        </div>
      )}

      {error && <div className="secret-block__error">{error}</div>}

      {settingValue && (
        <div className="secret-block__set-row">
          <input
            type="text"
            value={valueDraft}
            placeholder="새 값 입력"
            onChange={(e) => setValueDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveValue();
            }}
          />
          <button type="button" onClick={saveValue}>
            저장
          </button>
        </div>
      )}
    </div>
  );
}
