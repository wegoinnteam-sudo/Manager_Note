import { useCallback, useEffect, useState } from "react";
import type { Role, UserDTO } from "@shared/types";
import { api, ApiClientError } from "@/lib/api";
import type { FontFamily, FontSize, FontWeight } from "@/hooks/useDisplaySettings";

interface DisplaySettings {
  fontSize: FontSize;
  fontWeight: FontWeight;
  fontFamily: FontFamily;
  setFontSize: (size: FontSize) => void;
  setFontWeight: (weight: FontWeight) => void;
  setFontFamily: (family: FontFamily) => void;
}

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "sm", label: "작게" },
  { value: "md", label: "보통" },
  { value: "lg", label: "크게" },
  { value: "xl", label: "아주 크게" },
];

const FONT_WEIGHT_OPTIONS: { value: FontWeight; label: string }[] = [
  { value: "normal", label: "보통" },
  { value: "bold", label: "굵게" },
];

const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "sans", label: "기본" },
  { value: "gothic", label: "고딕" },
  { value: "serif", label: "명조" },
  { value: "mono", label: "고정폭" },
];

function DisplaySettingsSection({ settings }: { settings: DisplaySettings }) {
  return (
    <div className="section">
      <div className="section__title">글꼴 설정 (이 기기에만 저장됨)</div>
      <div className="display-settings">
        <div className="display-settings__row">
          <span className="display-settings__label">글씨 크기</span>
          <div className="display-settings__options" role="radiogroup" aria-label="글씨 크기">
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={settings.fontSize === option.value}
                className={settings.fontSize === option.value ? "display-settings__btn display-settings__btn--active" : "display-settings__btn"}
                onClick={() => settings.setFontSize(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="display-settings__row">
          <span className="display-settings__label">글씨 굵기</span>
          <div className="display-settings__options" role="radiogroup" aria-label="글씨 굵기">
            {FONT_WEIGHT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={settings.fontWeight === option.value}
                className={settings.fontWeight === option.value ? "display-settings__btn display-settings__btn--active" : "display-settings__btn"}
                onClick={() => settings.setFontWeight(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="display-settings__row">
          <span className="display-settings__label">글씨체</span>
          <div className="display-settings__options" role="radiogroup" aria-label="글씨체">
            {FONT_FAMILY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={settings.fontFamily === option.value}
                className={settings.fontFamily === option.value ? "display-settings__btn display-settings__btn--active" : "display-settings__btn"}
                onClick={() => settings.setFontFamily(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSettings({ displaySettings }: { displaySettings: DisplaySettings }) {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { users: rows } = await api.adminListUsers();
    setUsers(rows);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invite = async () => {
    setMessage(null);
    try {
      await api.adminInvite(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await refresh();
      setMessage("초대되었습니다. 초대된 이메일로 Google 로그인하면 접속할 수 있습니다.");
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : "초대에 실패했습니다.");
    }
  };

  const changeRole = async (id: string, role: Role) => {
    await api.adminSetRole(id, role);
    await refresh();
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.driveSync();
      setSyncMessage(`동기화 완료 — 추가 ${result.filesAdded} · 갱신 ${result.filesUpdated} · 건너뜀 ${result.filesSkipped}`);
    } catch (err) {
      setSyncMessage(err instanceof ApiClientError ? err.message : "동기화에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page-view">
      <h2>설정</h2>

      <DisplaySettingsSection settings={displaySettings} />

      <div className="section">
        <div className="section__title">Google Drive 동기화</div>
        <button type="button" disabled={syncing} onClick={runSync} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}>
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
        {syncMessage && <p style={{ fontSize: 12, marginTop: 8 }}>{syncMessage}</p>}
      </div>

      <div className="section">
        <div className="section__title">팀원 초대</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ padding: "6px 10px", borderRadius: 6 }}>
            <option value="viewer">열람자</option>
            <option value="editor">편집자</option>
            <option value="admin">관리자</option>
          </select>
          <button type="button" onClick={invite} disabled={!inviteEmail.trim()} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer" }}>
            초대
          </button>
        </div>
        {message && <p style={{ fontSize: 12, marginTop: 8 }}>{message}</p>}
      </div>

      <div className="section">
        <div className="section__title">팀원 목록</div>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)", fontSize: 13 }}>
            <span>
              {u.name} · {u.email}
            </span>
            <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)} style={{ fontSize: 12 }}>
              <option value="viewer">열람자</option>
              <option value="editor">편집자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
