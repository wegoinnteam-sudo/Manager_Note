import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const SIDES = [
  { key: "left", label: "왼쪽 여백" },
  { key: "right", label: "오른쪽 여백" },
  { key: "top", label: "위쪽 여백" },
  { key: "bottom", label: "아래쪽 여백" },
] as const;

type Side = (typeof SIDES)[number]["key"];
type Margins = Record<Side, number>;
type Draft = Record<Side, string>;

function isMargin(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readMargins(key: string): Margins | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return saved && SIDES.every(({ key }) => isMargin(saved[key])) ? saved : null;
  } catch {
    return null;
  }
}

function measureDefaults(element: HTMLElement): Margins {
  const style = getComputedStyle(element);
  const panelWidth = element.parentElement?.clientWidth ?? element.offsetWidth;
  const maxWidth = parseFloat(style.getPropertyValue("--page-default-max-width"));
  const centeredSpace = Number.isFinite(maxWidth) ? Math.max(0, panelWidth - maxWidth) / 2 : 0;
  return {
    left: Math.round(parseFloat(style.getPropertyValue("--page-default-left")) + centeredSpace),
    right: Math.round(parseFloat(style.getPropertyValue("--page-default-right")) + centeredSpace),
    top: Math.round(parseFloat(style.getPropertyValue("--page-default-top"))),
    bottom: Math.round(parseFloat(style.getPropertyValue("--page-default-bottom"))),
  };
}

export function usePageMargins(pageId: string, enabled: boolean) {
  const storageKey = `wegoinn.page-margins.${pageId}`;
  const [saved, setSaved] = useState(() => readMargins(storageKey));
  const [defaults, setDefaults] = useState<Margins | null>(null);
  const [preview, setPreview] = useState<Margins | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F7" && !(defaults && event.key === "Escape")) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (defaults) {
        setPreview(null);
        setDefaults(null);
      } else if (contentRef.current && !document.querySelector("dialog[open]")) {
        setDefaults(measureDefaults(contentRef.current));
      }
    };
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, [enabled, defaults]);

  const cancel = () => {
    setPreview(null);
    setDefaults(null);
  };

  const apply = (margins: Margins) => {
    const useDefaults = SIDES.every(({ key }) => margins[key] === defaults?.[key]);
    if (useDefaults) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(margins));
    setSaved(useDefaults ? null : margins);
    cancel();
  };

  const showingDefaults = preview && SIDES.every(({ key }) => preview[key] === defaults?.[key]);
  const margins = enabled && !showingDefaults ? preview ?? saved : null;
  const style: CSSProperties | undefined = margins ? {
    maxWidth: "none",
    padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
  } : undefined;

  return {
    contentRef,
    style,
    dialog: enabled && defaults && (
      <PageMarginsDialog initial={saved ?? defaults} defaults={defaults} onPreview={setPreview} onApply={apply} onCancel={cancel} />
    ),
  };
}

function toDraft(margins: Margins): Draft {
  return { left: String(margins.left), right: String(margins.right), top: String(margins.top), bottom: String(margins.bottom) };
}

function parseMargin(value: string): number | null {
  const number = Number(value);
  return value.trim() && isMargin(number) ? number : null;
}

function PageMarginsDialog({ initial, defaults, onPreview, onApply, onCancel }: {
  initial: Margins;
  defaults: Margins;
  onPreview: (margins: Margins) => void;
  onApply: (margins: Margins) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [error, setError] = useState(false);
  const [margins, setMargins] = useState(initial);
  const valid = SIDES.every(({ key }) => parseMargin(draft[key]) !== null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const change = (key: Side, value: string) => {
    setDraft({ ...draft, [key]: value });
    const parsed = parseMargin(value);
    if (parsed !== null) {
      const next = { ...margins, [key]: parsed };
      setMargins(next);
      onPreview(next);
    }
  };

  const horizontalScale = Math.max(420, (margins.left + margins.right) * 1.3);
  const verticalScale = Math.max(460, (margins.top + margins.bottom) * 1.3);

  return (
    <dialog
      ref={dialogRef}
      className="page-margins"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        try {
          onApply(margins);
        } catch {
          setError(true);
        }
      }}>
        <header className="page-margins__header">
          <h2 id={titleId}>페이지 여백 설정</h2>
          <button type="button" onClick={onCancel} aria-label="닫기">×</button>
        </header>
        <div className="page-margins__body">
          <div className="page-margins__fields">
            {SIDES.map(({ key, label }) => (
              <div className="page-margins__field" key={key}>
                <label htmlFor={`${titleId}-${key}`}>{label}</label>
                <div className="page-margins__stepper">
                  <input
                    id={`${titleId}-${key}`}
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={draft[key]}
                    onChange={(event) => change(key, event.target.value)}
                  />
                  <span>px</span>
                  <div className="page-margins__steps">
                    <button type="button" aria-label={`${label} 늘리기`} onClick={() => change(key, String(margins[key] + 1))}>▴</button>
                    <button type="button" aria-label={`${label} 줄이기`} disabled={margins[key] === 0} onClick={() => change(key, String(margins[key] - 1))}>▾</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <figure className="page-margins__figure">
            <figcaption>미리보기</figcaption>
            <div className="page-margins__paper" aria-hidden="true" style={{
              "--preview-top": `${margins.top / verticalScale * 100}%`,
              "--preview-right": `${margins.right / horizontalScale * 100}%`,
              "--preview-bottom": `${margins.bottom / verticalScale * 100}%`,
              "--preview-left": `${margins.left / horizontalScale * 100}%`,
            } as CSSProperties}>
              <div className="page-margins__paper-content"><span /><span /><span /><span /></div>
            </div>
          </figure>
        </div>
        {error && <p className="page-margins__error" role="alert">브라우저에 여백 설정을 저장하지 못했습니다.</p>}
        <footer className="page-margins__footer">
          <button type="button" onClick={() => {
            setDraft(toDraft(defaults));
            setMargins(defaults);
            onPreview(defaults);
          }}>기본값 복원</button>
          <button type="button" onClick={onCancel}>취소</button>
          <button type="submit" disabled={!valid}>적용</button>
        </footer>
      </form>
    </dialog>
  );
}
