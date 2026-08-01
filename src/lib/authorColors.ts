// Calendar schedules are color-coded by author (see CalendarGrid in
// DatabaseView.tsx). Every unauthenticated visitor shares one "공용 편집자"
// login (see useGuestIdentity), so the real account id (createdBy) can't
// tell two people apart — the locally-typed display name (authorName,
// snapshotted on the page at creation time) can, and is what this keys on.
import type { PageSummaryDTO, TeamMemberDTO } from "@shared/types";

export interface AuthorColor {
  key: string;
  background: string;
  text: string;
  label: string;
}

// Distinct, readable-on-white defaults for names that haven't picked a
// custom color yet in settings. Chosen deterministically from the name so
// the same person always gets the same default across sessions/devices.
const DEFAULT_AUTHOR_PALETTE = [
  "#2563EB",
  "#DC2626",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
  "#65A30D",
  "#EA580C",
  "#4F46E5",
];

function hashToIndex(id: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % size;
}

export function defaultAuthorColor(name: string): string {
  return DEFAULT_AUTHOR_PALETTE[hashToIndex(name, DEFAULT_AUTHOR_PALETTE.length)];
}

// The identity a schedule is colored/grouped by: the guest name typed when
// it was created, falling back to the real account's name for the rare
// page created without one (e.g. a distinct admin login, or old data from
// before this field existed).
export function authorKey(item: Pick<PageSummaryDTO, "authorName" | "createdBy">, members: TeamMemberDTO[]): string {
  return item.authorName?.trim() || members.find((m) => m.id === item.createdBy)?.name || item.createdBy;
}

export function colorForAuthorName(name: string, guestColors: Record<string, string>): AuthorColor {
  return {
    key: name,
    background: guestColors[name] || defaultAuthorColor(name),
    text: "#FFFFFF",
    label: name,
  };
}

export function getAuthorColor(
  item: Pick<PageSummaryDTO, "authorName" | "createdBy">,
  members: TeamMemberDTO[],
  guestColors: Record<string, string>,
): AuthorColor {
  return colorForAuthorName(authorKey(item, members), guestColors);
}
