import { useState } from "react";

export function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 360 }}>
        <div className="modal__header">
          <strong>이름을 알려주세요</strong>
        </div>
        <div className="modal__body" style={{ alignItems: "stretch", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            팀원들이 지금 어떤 페이지를 보고 있는지, 어디를 편집 중인지 실시간으로 알 수 있도록 이름을 입력해주세요.
          </p>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="예: 홍길동"
            style={{ padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 14 }}
          />
          <button
            type="button"
            disabled={!value.trim()}
            onClick={submit}
            style={{ border: "none", background: "var(--color-accent)", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
