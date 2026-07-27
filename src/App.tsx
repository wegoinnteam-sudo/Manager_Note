import { useCallback, useRef, useState } from "react";
import type { UserDTO } from "@shared/types";
import { useAuth } from "@/hooks/useAuth";
import { usePages } from "@/hooks/usePages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useRoute } from "@/hooks/useRoute";
import { api } from "@/lib/api";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { PageView } from "@/features/pages/PageView";
import { Trash } from "@/features/trash/Trash";
import { AdminSettings } from "@/features/admin/AdminSettings";
import { SearchResults } from "@/features/search/SearchResults";
import { GlobalDropzone } from "@/features/files/GlobalDropzone";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="login-screen">
      <h1>팀 인수인계 노트</h1>
      <p>Google 계정으로 로그인하세요. 초대된 팀원만 접속할 수 있습니다.</p>
      <button type="button" onClick={onLogin}>
        Google로 로그인
      </button>
    </div>
  );
}

function AppShell({ user, logout }: { user: UserDTO; logout: () => void }) {
  const { pages, refresh: refreshPages } = usePages();
  const members = useTeamMembers();
  const { path, navigate } = useRoute();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [justCreatedPageId, setJustCreatedPageId] = useState<string | null>(null);
  const dropHandlerRef = useRef<(files: FileList) => void>(() => {});

  const registerFileDropHandler = useCallback((fn: (files: FileList) => void) => {
    dropHandlerRef.current = fn;
  }, []);

  const openPage = useCallback(
    (id: string) => {
      navigate(`/page/${id}`);
      setSidebarOpen(false);
    },
    [navigate],
  );

  const createPage = useCallback(async () => {
    const page = await api.createPage({});
    await refreshPages();
    setJustCreatedPageId(page.id);
    openPage(page.id);
  }, [refreshPages, openPage]);

  const activePageId = path.startsWith("/page/") ? path.slice("/page/".length) : null;
  const canEdit = user.role === "editor" || user.role === "admin";
  const canDeleteAll = canEdit;

  let content: React.ReactNode;
  if (path === "/trash") {
    content = <Trash canRestore={canEdit} onOpenPage={openPage} onRestored={refreshPages} />;
  } else if (path === "/admin") {
    content = user.role === "admin" ? <AdminSettings /> : <div className="page-view">관리자만 접근할 수 있습니다.</div>;
  } else if (path.startsWith("/search/")) {
    content = <SearchResults query={decodeURIComponent(path.slice("/search/".length))} onOpenPage={openPage} />;
  } else if (activePageId) {
    content = (
      <PageView
        key={activePageId}
        pageId={activePageId}
        canEdit={canEdit}
        canDelete={canDeleteAll}
        members={members}
        autoFocusTitle={justCreatedPageId === activePageId}
        onConsumedAutoFocus={() => setJustCreatedPageId(null)}
        registerFileDropHandler={registerFileDropHandler}
        onDeleted={() => navigate("/")}
        onPagesChanged={refreshPages}
      />
    );
  } else {
    content = (
      <div className="page-view">
        <h2>팀 인수인계 노트</h2>
        <p>왼쪽에서 페이지를 선택하거나 새 페이지를 만들어보세요.</p>
      </div>
    );
  }

  return (
    <GlobalDropzone active={!!activePageId && canEdit} onFiles={(files) => dropHandlerRef.current(files)}>
      <div className="app-shell">
        <Sidebar
          className={sidebarOpen ? "sidebar--open" : ""}
          teamName="팀 인수인계 노트"
          user={user}
          pages={pages}
          activePageId={activePageId}
          onOpenPage={openPage}
          onCreatePage={createPage}
          onNavigate={(p) => {
            navigate(p);
            setSidebarOpen(false);
          }}
          onSearch={(q) => navigate(`/search/${encodeURIComponent(q)}`)}
          onLogout={logout}
        />
        <div className="main">
          <div className="topbar">
            <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="메뉴">
              ☰
            </button>
          </div>
          {content}
        </div>
      </div>
    </GlobalDropzone>
  );
}

export default function App() {
  const { user, loading, login, logout } = useAuth();

  if (loading) {
    return <div className="login-screen">불러오는 중…</div>;
  }
  if (!user) {
    return <LoginScreen onLogin={login} />;
  }
  return <AppShell user={user} logout={logout} />;
}
