// Single source of truth for how a calendar schedule (a page with a due
// date) is color-coded. This app is single-team (see worker/db/teams.ts —
// every page shares one team_default), so there is no real "team" to color
// by; the existing page category (Reception/Cleaning/운영/Wegoinn2.0/
// Marketing, already defined in shared/types.ts) is the closest existing
// fixed, labeled grouping and is reused here instead of inventing a
// parallel color system.
import type { PageCategory } from "@shared/types";
import { CATEGORY_COLORS, CATEGORY_LABELS, PAGE_CATEGORIES, UNCATEGORIZED_COLOR, UNCATEGORIZED_LABEL } from "@shared/types";

export interface ScheduleColor {
  key: string;
  background: string;
  text: string;
  label: string;
}

const UNASSIGNED_KEY = "__unassigned__";

export function getScheduleColor(category: PageCategory | null): ScheduleColor {
  if (category && CATEGORY_COLORS[category]) {
    return { key: category, background: CATEGORY_COLORS[category], text: "#FFFFFF", label: CATEGORY_LABELS[category] ?? category };
  }
  return { key: UNASSIGNED_KEY, background: UNCATEGORIZED_COLOR, text: "#FFFFFF", label: UNCATEGORIZED_LABEL };
}

// Legend entries for every known category plus "미지정", in a stable order.
export const SCHEDULE_LEGEND: ScheduleColor[] = [
  ...PAGE_CATEGORIES.map((category) => getScheduleColor(category)),
  getScheduleColor(null),
];

export { UNASSIGNED_KEY as SCHEDULE_UNASSIGNED_KEY };
