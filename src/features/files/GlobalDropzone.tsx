import { useEffect, useRef, useState } from "react";

const INTERNAL_BLOCK_DRAG_TYPE = "application/x-team-note-block";

/**
 * Makes the ENTIRE page a drop target, not just a small upload box. Files
 * dropped anywhere on screen attach to whatever page is currently open
 * (the parent decides that via onFiles).
 */
export function GlobalDropzone({ active, onFiles, children }: { active: boolean; onFiles: (files: FileList) => void; children: React.ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!active) return;

    function hasFiles(e: DragEvent) {
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types);
      return types.includes("Files") && !types.includes(INTERNAL_BLOCK_DRAG_TYPE);
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      setDragging(true);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragging(false);
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [active, onFiles]);

  return (
    <>
      {children}
      {active && dragging && <div className="drop-overlay">여기에 놓으면 페이지에 바로 삽입됩니다</div>}
    </>
  );
}
