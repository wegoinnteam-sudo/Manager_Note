import { useCallback, useEffect, useRef, useState } from "react";
import type { UserDTO } from "@shared/types";
import { useAuth } from "@/hooks/useAuth";
import { usePages } from "@/hooks/usePages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useRoute } from "@/hooks/useRoute";
import { useGuestIdentity } from "@/hooks/useGuestIdentity";
import { usePresence } from "@/hooks/usePresence";
import { useTheme } from "@/hooks/useTheme";
import { usePageCategories } from "@/hooks/usePageCategories";
import { api } from "@/lib/api";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { WegoinnBoard } from "@/features/board/WegoinnBoard";
import { PageView } from "@/features/pages/PageView";
import { Trash } from "@/features/trash/Trash";
import { AdminSettings } from "@/features/admin/AdminSettings";
import { SearchResults } from "@/features/search/SearchResults";
import { GlobalDropzone } from "@/features/files/GlobalDropzone";
import { LoginScreen } from "@/features/identity/LoginScreen";
import type { GuestIdentity } from "@/hooks/useGuestIdentity";

function AppShell({ user, identity }: { user: UserDTO; identity: GuestIdentity }) {
  const { pages, setPages, refresh: refreshPages } = usePages();
  const members = useTeamMembers();
  const { path, navigate } = useRoute();
  const { users: presenceUsers, report: reportCursor } = usePresence(identity);
  const { preference: theme, setTheme } = useTheme();
  const { categories, refresh: refreshCategories } = usePageCategories();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [justCreatedPageId, setJustCreatedPageId] = useState<string | null>(null);
  const [peekPageId, setPeekPageId] = useState<string | null>(null);
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

  const reorderPage = useCallback(
    async (pageId: string, orderKey: number, parentId?: string | null) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) return;

      setPages((current) =>
        current.map((candidate) =>
          candidate.id === pageId ? { ...candidate, orderKey, ...(parentId !== undefined ? { parentId } : {}) } : candidate,
        ),
      );
      try {
        await api.updatePageMeta(pageId, { expectedVersion: page.version, orderKey, ...(parentId !== undefined ? { parentId } : {}) });
      } finally {
        await refreshPages();
      }
    },
    [pages, refreshPages, setPages],
  );

  const activePageId = path.startsWith("/page/") ? path.slice("/page/".length) : null;
  const canEdit = user.role === "editor" || user.role === "admin";
  const canDeleteAll = canEdit;

  // Announce which page (if any) is now open the moment navigation happens,
  // ahead of any in-block cursor reports, so others' sidebar viewer badges
  // update even before the cursor lands in a specific block.
  useEffect(() => {
    reportCursor(activePageId, null, 0);
  }, [activePageId, reportCursor]);

  // Opening a card from Wegoinn DB never leaves /db — it peeks the page in a
  // side panel instead. Any other navigation away should close that panel.
  useEffect(() => {
    if (path !== "/db") setPeekPageId(null);
  }, [path]);

  let content: React.ReactNode;
  if (path === "/db") {
    content = (
      <>
        <WegoinnBoard
          pages={pages}
          members={members}
          user={user}
          canEdit={canEdit}
          categories={categories}
          onCategoriesChanged={refreshCategories}
          onOpenPage={openPage}
          onPeekPage={setPeekPageId}
          onPagesChanged={refreshPages}
          onNavigate={navigate}
        />
        {peekPageId && (
          <div className="wdb-peek-overlay" onClick={() => setPeekPageId(null)}>
            <div className="wdb-peek-panel" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="wdb-peek-panel__back" onClick={() => setPeekPageId(null)}>
                🗂 Wegoinn DB
              </button>
              <div className="wdb-peek-panel__body">
                <PageView
                  key={peekPageId}
                  pageId={peekPageId}
                  canEdit={canEdit}
                  canDelete={canDeleteAll}
                  members={members}
                  autoFocusTitle={false}
                  onConsumedAutoFocus={() => {}}
                  registerFileDropHandler={registerFileDropHandler}
                  onDeleted={() => setPeekPageId(null)}
                  onPagesChanged={refreshPages}
                  onOpenPage={setPeekPageId}
                  pages={pages}
                  presenceUsers={presenceUsers}
                  onCursorReport={(blockId, offset) => reportCursor(peekPageId, blockId, offset)}
                  guestName={identity.name}
                  canViewSensitive={canEdit}
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  } else if (path === "/trash") {
    content = <Trash canRestore={canEdit} onOpenPage={openPage} onRestored={refreshPages} />;
  } else if (path === "/admin") {
    content = <AdminSettings />;
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
        onOpenPage={openPage}
        pages={pages}
        presenceUsers={presenceUsers}
        onCursorReport={(blockId, offset) => reportCursor(activePageId, blockId, offset)}
        guestName={identity.name}
        canViewSensitive={canEdit}
      />
    );
  } else {
    content = (
      <div className="page-view">
        <h2>팀 인수인계 노트</h2>
        <p>왼쪽에서 페이지를 선택하거나 새 페이지를 만들어보세요.</p>
        <button type="button" className="wdb__home-link" onClick={() => navigate("/db")}>
          🗂 Wegoinn DB 열기
        </button>
      </div>
    );
  }

  return (
    <GlobalDropzone active={(!!activePageId || !!peekPageId) && canEdit} onFiles={(files) => dropHandlerRef.current(files)}>
      <div className="app-shell">
        <Sidebar
          className={sidebarOpen ? "sidebar--open" : ""}
          teamName="팀 인수인계 노트"
          user={user}
          pages={pages}
          categories={categories}
          activePageId={activePageId}
          onOpenPage={openPage}
          onCreatePage={createPage}
          canReorder={canEdit}
          onReorderPage={reorderPage}
          onNavigate={(p) => {
            navigate(p);
            setSidebarOpen(false);
          }}
          onSearch={(q) => navigate(`/search/${encodeURIComponent(q)}`)}
          presenceUsers={presenceUsers}
          onPagesChanged={refreshPages}
          members={members}
          theme={theme}
          onThemeChange={setTheme}
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
  const { user, loading } = useAuth();
  const { identity, setName } = useGuestIdentity();

  if (loading) {
    return <div className="login-screen">불러오는 중…</div>;
  }
  if (!user) {
    return <div className="login-screen">노트를 불러오지 못했습니다. 잠시 후 새로고침해주세요.</div>;
  }
  if (!identity) {
    return <LoginScreen onSubmit={setName} />;
  }
  return <AppShell user={user} identity={identity} />;
}
