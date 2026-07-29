import { Fragment, type ReactNode } from "react";

/**
 * Tiny, whitelist-only inline formatter: **bold**, *italic*, __underline__,
 * ~strikethrough~, `code`, [text](url), @[text](user:id|date:iso).
 * Deliberately not a full markdown parser and never touches
 * dangerouslySetInnerHTML — every token becomes a real React element, so
 * there is no injection surface here regardless of what a user types.
 */
export function renderInline(text: string): ReactNode {
  const tokenRe = /(@\[[^\]]+\]\((?:user|date):[^)]+\)|\*\*[^*]+\*\*|__[^_]+__|~[^~]+~|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRe).filter((p) => p !== undefined && p !== "");

  return parts.map((part, i) => {
    const mentionMatch = part.match(/^@\[([^\]]+)\]\((user|date):[^)]+\)$/);
    if (mentionMatch) {
      const [, label, kind] = mentionMatch;
      return (
        <span key={i} className={`mention-chip mention-chip--${kind}`}>
          {kind === "user" ? "👤" : "📅"} {label}
        </span>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^__[^_]+__$/.test(part)) {
      return <u key={i}>{part.slice(2, -2)}</u>;
    }
    if (/^~[^~]+~$/.test(part)) {
      return <s key={i}>{part.slice(1, -1)}</s>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const safeHref = /^https?:\/\//i.test(href) ? href : "#";
      return (
        <a key={i} href={safeHref} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
