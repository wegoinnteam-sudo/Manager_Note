import { useCallback, useEffect, useState } from "react";

/** Minimal history-API router. Avoids pulling in react-router for a handful of screens. */
export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (to !== window.location.pathname) {
      if (opts?.replace) window.history.replaceState({}, "", to);
      else window.history.pushState({}, "", to);
      setPath(to);
    }
  }, []);

  return { path, navigate };
}
