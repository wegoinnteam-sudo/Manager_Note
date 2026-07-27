import { useEffect } from "react";

export function Modal({
  title,
  onClose,
  headerExtra,
  children,
}: {
  title: string;
  onClose: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {headerExtra}
            <button type="button" onClick={onClose} aria-label="닫기" style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
