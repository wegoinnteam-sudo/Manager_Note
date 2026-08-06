import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced wrapper around `fn`. Used for autosave so we don't
 * fire a D1 write on every keystroke — only after the user pauses.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delayMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<A | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Runs the pending call right now instead of waiting out the delay — used
  // when the user leaves before the debounce timer would have fired, so the
  // edit isn't silently dropped.
  const flush = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (argsRef.current) fnRef.current(...argsRef.current);
  }, []);

  const isPending = useCallback(() => timerRef.current !== null, []);

  const debounced = useCallback(
    (...args: A) => {
      argsRef.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  return Object.assign(debounced, { cancel, flush, isPending });
}
