import { useState } from "react";

export function LoginScreen({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-card__title">팀 인수인계 노트</h1>
        <p className="login-card__desc">
          이름을 입력하면 시작할 수 있어요. 팀원들이 지금 어떤 페이지를 보고 있는지, 어디를 편집 중인지 실시간으로 공유됩니다.
        </p>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="이름을 입력하세요 (예: 홍길동)"
          className="login-card__input"
        />
        <button type="button" className="login-card__submit" disabled={!value.trim()} onClick={submit}>
          시작하기
        </button>
      </div>
    </div>
  );
}
