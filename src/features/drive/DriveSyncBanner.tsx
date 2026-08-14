import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DriveSyncState {
  status: "idle" | "running" | "failed";
}

export function DriveSyncBanner() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .driveSyncStatus()
      .then(({ state }) => setFailed((state as DriveSyncState | null)?.status === "failed"))
      .catch(() => {});
  }, []);

  if (!failed) return null;

  return (
    <div className="drive-sync-banner">
      Google Drive 연동이 끊어졌습니다 (재인증 필요) — 파일 업로드와 자동 동기화가 되지 않고 있습니다.
      <a href="/api/auth/google/login">지금 재인증하기</a>
    </div>
  );
}
