// Calendar schedules are color-coded by author (see calendar's CalendarGrid),
// not by category — this is the single source of truth for that mapping.
import type { TeamMemberDTO } from "@shared/types";

export interface AuthorColor {
  key: string;
  background: string;
  text: string;
  label: string;
}

// Distinct, readable-on-white defaults for people who haven't picked their
// own color yet in settings. Chosen deterministically from their user id so
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

export function defaultAuthorColor(userId: string): string {
  return DEFAULT_AUTHOR_PALETTE[hashToIndex(userId, DEFAULT_AUTHOR_PALETTE.length)];
}

export function getAuthorColor(userId: string, members: TeamMemberDTO[]): AuthorColor {
  const member = members.find((m) => m.id === userId);
  return {
    key: userId,
    background: member?.color || defaultAuthorColor(userId),
    text: "#FFFFFF",
    label: member?.name ?? "알 수 없음",
  };
}
