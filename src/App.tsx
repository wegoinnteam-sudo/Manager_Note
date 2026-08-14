import { useCallback, useEffect, useRef, useState } from "react";
import type { UserDTO } from "@shared/types";
import { useAuth } from "@/hooks/useAuth";
import { usePages } from "@/hooks/usePages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useGuestColors } from "@/hooks/useGuestColors";
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
import { DriveSyncBanner } from "@/features/drive/DriveSyncBanner";
import type { GuestIdentity } from "@/hooks/useGuestIdentity";

function AppShell({ user, identity }: { user: UserDTO; identity: GuestIdentity }) {
  const { pages, setPages, refresh: refreshPages } = usePages();
  const { members } = useTeamMembers();
  const { colors: guestColors, refresh: refreshGuestColors } = useGuestColors();
  const { path, navigate } = useRoute();
  const { users: presenceUsers, report: reportCursor } = usePresence(identity);
  const { preference: theme, setTheme } = useTheme();
  const { categories, refresh: refreshCategories } = usePageCategories();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [justCreatedPageId, setJustCreatedPageId] = useState<string | null>(null);
  // Each entry is one level of "peeked" page (opened from a Wegoinn DB card,
  // a calendar date, or a link inside another peeked page) — the last entry
  // is what's shown. Every push also adds a browser history entry (same URL,
  // just a marker in its state) so the keyboard/mouse back button can step
  // back through them one level at a time instead of losing the trail.
  const [peekStack, setPeekStack] = useState<Array<{ id: string; label: string | null; anchorLeft: number | null }>>([]);
  const peekDepthRef = useRef(0);
  const dropHandlerRef = useRef<(files: FileList) => void>(() => {});

  const peekPage = useCallback((id: string, label?: string, anchorLeft?: number) => {
    peekDepthRef.current += 1;
    window.history.pushState({ __peekLevel: peekDepthRef.current }, "", window.location.pathname);
    setPeekStack((stack) => [...stack, { id, label: label ?? null, anchorLeft: anchorLeft ?? null }]);
  }, []);

  // User-initiated full close (Escape, the panel's close button, page delete).
  // Unwinds exactly as many history entries as were pushed while peeking, so
  // the trail doesn't linger as dead entries the back button has to skip.
  const closePeek = useCallback(() => {
    if (peekDepthRef.current > 0) {
      window.history.go(-peekDepthRef.current);
    } else {
      setPeekStack([]);
    }
  }, []);

  // Silent reset used when a real route change makes the whole peek trail
  // moot — no history unwinding, since the route change already pushed its
  // own forward entry.
  const resetPeekSilently = useCallback(() => {
    peekDepthRef.current = 0;
    setPeekStack([]);
  }, []);

  const peekPageId = peekStack.length > 0 ? peekStack[peekStack.length - 1].id : null;
  const peekLabel = peekStack.length > 0 ? peekStack[peekStack.length - 1].label : null;
  const peekAnchorLeft = peekStack.length > 0 ? peekStack[peekStack.length - 1].anchorLeft : null;

  // Keyboard Backspace acts as "go back" (mirroring the mouse back button),
  // but only when the user isn't actively editing text — typing must delete
  // a character as normal, and existing selected-block/selected-page Backspace
  // handlers (which call preventDefault) still take priority.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      window.history.back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Mirrors browser back/forward through the peek trail: each pushed peek
  // entry carries how deep it is, so popping back (mouse back button or the
  // Backspace handler above) truncates the stack to match.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const level = (event.state as { __peekLevel?: number } | null)?.__peekLevel ?? 0;
      peekDepthRef.current = level;
      setPeekStack((stack) => stack.slice(0, level));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  // The app always opens on the Wegoinn DB board — no bare landing page.
  useEffect(() => {
    if (path === "/") navigate("/db", { replace: true });
  }, [path, navigate]);

  const activePageId = path.startsWith("/page/") ? path.slice("/page/".length) : null;
  const canEdit = user.role === "editor" || user.role === "admin";
  const canDeleteAll = canEdit;

  // Announce which page (if any) is now open the moment navigation happens,
  // ahead of any in-block cursor reports, so others' sidebar viewer badges
  // update even before the cursor lands in a specific block.
  useEffect(() => {
    reportCursor(activePageId, null, 0);
  }, [activePageId, reportCursor]);

  // Opening a card (from Wegoinn DB, or a calendar date inside a page) peeks
  // the page in a side panel instead of navigating away. Any actual route
  // change — sidebar click, back button, etc. — should close that panel.
  const prevPathRef = useRef(path);
  useEffect(() => {
    if (prevPathRef.current !== path) resetPeekSilently();
    prevPathRef.current = path;
  }, [path, resetPeekSilently]);

  // Escape closes the peek panel — but only when nothing inside it already
  // claimed the key (the editor itself preventDefaults Escape to select a
  // block or close its own slash/mention menu, and that existing behavior
  // should keep working exactly as it does today).
  useEffect(() => {
    if (!peekPageId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      closePeek();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [peekPageId, closePeek]);

  let content: React.ReactNode;
  if (path === "/db") {
    content = (
      <WegoinnBoard
        pages={pages}
        members={members}
        user={user}
        canEdit={canEdit}
        categories={categories}
        onCategoriesChanged={refreshCategories}
        onOpenPage={openPage}
        onPeekPage={peekPage}
        onPagesChanged={refreshPages}
        onNavigate={navigate}
      />
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
        guestColors={guestColors}
        autoFocusTitle={justCreatedPageId === activePageId}
        onConsumedAutoFocus={() => setJustCreatedPageId(null)}
        registerFileDropHandler={registerFileDropHandler}
        onDeleted={() => navigate("/")}
        onPagesChanged={refreshPages}
        onOpenPage={openPage}
        onPeekPage={peekPage}
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
    <div className="app-root">
      <DriveSyncBanner />
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
          guestName={identity.name}
          guestColors={guestColors}
          onGuestColorChanged={refreshGuestColors}
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
        {peekPageId && (() => {
          const panel = (
            <div
              className={peekAnchorLeft != null ? "wdb-peek-panel wdb-peek-panel--docked" : "wdb-peek-panel"}
              style={peekAnchorLeft != null ? { left: peekAnchorLeft } : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wdb-peek-panel__header">
                <button type="button" className="wdb-peek-panel__back" onClick={closePeek}>
                  {path === "/db" ? "🗂 Wegoinn DB" : "✕ 닫기"}
                </button>
                {peekLabel && <span className="wdb-peek-panel__label">{peekLabel}</span>}
              </div>
              <div className="wdb-peek-panel__body">
                <PageView
                  key={peekPageId}
                  pageId={peekPageId}
                  canEdit={canEdit}
                  canDelete={canDeleteAll}
                  members={members}
                  guestColors={guestColors}
                  autoFocusTitle={false}
                  onConsumedAutoFocus={() => {}}
                  registerFileDropHandler={registerFileDropHandler}
                  onDeleted={closePeek}
                  onPagesChanged={refreshPages}
                  onOpenPage={peekPage}
                  onPeekPage={peekPage}
                  pages={pages}
                  presenceUsers={presenceUsers}
                  onCursorReport={(blockId, offset) => reportCursor(peekPageId, blockId, offset)}
                  guestName={identity.name}
                  canViewSensitive={canEdit}
                  autoSave={peekAnchorLeft == null}
                />
              </div>
            </div>
          );
          // Docked (calendar-triggered) peeks skip the dimming backdrop so the
          // calendar itself stays fully visible and clickable next to the panel.
          return peekAnchorLeft != null ? panel : (
            <div className="wdb-peek-overlay" onClick={closePeek}>
              {panel}
            </div>
          );
        })()}
        </div>
      </GlobalDropzone>
    </div>
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
