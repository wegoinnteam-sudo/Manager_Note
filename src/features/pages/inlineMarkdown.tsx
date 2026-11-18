import { Fragment, type ReactNode } from "react";

const INLINE_TOKEN = /(@\[[^\]]+\]\((?:user|date):[^)]+\)|\*\*[^*]+\*\*|__[^_]+__|~[^~]+~|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s]+)/g;

/**
 * Tiny, whitelist-only inline formatter: **bold**, *italic*, __underline__,
 * ~strikethrough~, `code`, [text](url), @[text](user:id|date:iso), and bare
 * http(s):// URLs auto-linked. Deliberately not a full markdown parser and
 * never touches dangerouslySetInnerHTML — every token becomes a real React
 * element, so there is no injection surface here regardless of what a user
 * types.
 */
export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_TOKEN).filter((p) => p !== undefined && p !== "");

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
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      // Strip trailing punctuation that's usually sentence formatting, not
      // part of the URL (e.g. "...주소는 https://example.com 입니다.").
      const trailing = part.match(/[.,!?:;'")\]]+$/)?.[0] ?? "";
      const href = trailing ? part.slice(0, -trailing.length) : part;
      return (
        <Fragment key={i}>
          <a href={href} target="_blank" rel="noopener noreferrer">
            {href}
          </a>
          {trailing}
        </Fragment>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Removes a visible text range while keeping the source formatting around it. */
export function deleteInlineRange(text: string, start: number, end: number): string {
  let offset = 0;
  return text.split(INLINE_TOKEN).map((part, index) => {
    const token = index % 2 === 1 ? part : "";
    const mention = token.match(/^@\[([^\]]+)\]\((user|date):[^)]+\)$/);
    const formatted = token.match(/^(\*\*|__|~|`|\*)([\s\S]+)\1$/);
    const link = token.match(/^\[([^\]]+)\](\([^)]+\))$/);
    const visible = mention ? `${mention[2] === "user" ? "👤" : "📅"} ${mention[1]}` : formatted?.[2] ?? link?.[1] ?? part;
    const length = visible.length;
    const from = Math.max(start - offset, 0);
    const to = Math.min(end - offset, length);
    offset += length;
    if (from >= to) return part;
    if (mention) return "";
    const remaining = visible.slice(0, from) + visible.slice(to);
    if (!remaining) return "";
    if (formatted) return formatted[1] + remaining + formatted[1];
    if (link) return `[${remaining}]${link[2]}`;
    return remaining;
  }).join("");
}
