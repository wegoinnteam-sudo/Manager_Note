// Computes the pixel position of a character offset inside a <textarea> by
// mirroring its text into an identically-styled hidden div and measuring
// where a marker span lands. Textareas have no native API for this, so this
// "mirror div" technique is the standard way to do it without a library.

const MIRRORED_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
] as const;

export function caretPixelPosition(el: HTMLTextAreaElement, offset: number): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";

  for (const prop of MIRRORED_PROPERTIES) {
    mirror.style[prop] = style[prop];
  }

  const clamped = Math.max(0, Math.min(offset, el.value.length));
  const before = el.value.slice(0, clamped);
  const after = el.value.slice(clamped) || ".";

  mirror.textContent = before;
  const marker = document.createElement("span");
  marker.textContent = after;
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 18;
  const position = { top: marker.offsetTop, left: marker.offsetLeft, height: lineHeight };

  document.body.removeChild(mirror);
  return position;
}

// Finds the character offset in `text` on the first (or last) visual line of
// `el` whose horizontal position is closest to `targetLeft`. Used when moving
// the caret between blocks with ArrowUp/ArrowDown, so the caret lands under
// roughly the same column it left rather than jumping to the start/end.
export function offsetAtEdgeLine(el: HTMLTextAreaElement, text: string, targetLeft: number, edge: "first" | "last"): number {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";

  for (const prop of MIRRORED_PROPERTIES) {
    mirror.style[prop] = style[prop];
  }

  const spans: HTMLSpanElement[] = [];
  for (const ch of text) {
    const span = document.createElement("span");
    span.textContent = ch;
    mirror.appendChild(span);
    spans.push(span);
  }
  const endSpan = document.createElement("span");
  endSpan.textContent = ".";
  mirror.appendChild(endSpan);
  spans.push(endSpan);

  document.body.appendChild(mirror);
  const positions = spans.map((s) => ({ top: s.offsetTop, left: s.offsetLeft }));
  document.body.removeChild(mirror);

  const lineTop = edge === "first" ? positions[0].top : positions[positions.length - 1].top;

  let bestOffset = edge === "first" ? 0 : text.length;
  let bestDist = Infinity;
  positions.forEach((pos, i) => {
    if (pos.top !== lineTop) return;
    const dist = Math.abs(pos.left - targetLeft);
    if (dist < bestDist) {
      bestDist = dist;
      bestOffset = i;
    }
  });

  return bestOffset;
}
