import { useCallback, useEffect, useState } from "react";
import type { Role, UserDTO } from "@shared/types";
import { api, ApiClientError } from "@/lib/api";

export function AdminSettings() {
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

      <div className="section">
        <div className="section__title">Google Drive 동기화</div>
        <button type="button" disabled={syncing} onClick={runSync} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
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
          <button type="button" onClick={invite} disabled={!inviteEmail.trim()} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
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
