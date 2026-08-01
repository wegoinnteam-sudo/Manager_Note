// Pure layout math for rendering multi-day schedule bars on a month grid.
// Kept framework-free and separate from CalendarGrid's JSX so the tricky
// part (clipping a date range to a week row, stacking overlapping events
// into lanes) is unit-testable without rendering anything.

export interface CalendarBarSegment<T> {
  item: T;
  startCol: number; // 0-6, column within the week row
  span: number; // number of columns, always >= 1
  lane: number; // vertical stacking index within the row
  continuesBefore: boolean; // the event's real start is before this row
  continuesAfter: boolean; // the event's real end is after this row
}

interface RangeItem {
  startDate: string;
  endDate: string;
}

// weekDateKeys has length 7; entries are "YYYY-MM-DD" for in-month days and
// null for the leading/trailing padding cells outside the visible month.
export function layoutWeekSegments<T extends RangeItem>(weekDateKeys: (string | null)[], items: T[]): CalendarBarSegment<T>[] {
  const rowStartIdx = weekDateKeys.findIndex((k) => k !== null);
  if (rowStartIdx === -1) return [];
  let rowEndIdx = rowStartIdx;
  for (let i = 0; i < weekDateKeys.length; i++) if (weekDateKeys[i] !== null) rowEndIdx = i;
  const rowStart = weekDateKeys[rowStartIdx] as string;
  const rowEnd = weekDateKeys[rowEndIdx] as string;

  const clipped = items
    .map((item) => {
      const start = item.startDate <= item.endDate ? item.startDate : item.endDate;
      const end = item.startDate <= item.endDate ? item.endDate : item.startDate;
      if (end < rowStart || start > rowEnd) return null;
      const clippedStart = start < rowStart ? rowStart : start;
      const clippedEnd = end > rowEnd ? rowEnd : end;
      const startCol = weekDateKeys.indexOf(clippedStart);
      const endCol = weekDateKeys.indexOf(clippedEnd);
      if (startCol === -1 || endCol === -1) return null;
      return {
        item,
        startCol,
        span: endCol - startCol + 1,
        continuesBefore: start < clippedStart,
        continuesAfter: end > clippedEnd,
        sortStart: start,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => (a.sortStart < b.sortStart ? -1 : a.sortStart > b.sortStart ? 1 : b.span - a.span));

  const laneEndCols: number[] = [];
  const segments: CalendarBarSegment<T>[] = [];
  for (const seg of clipped) {
    let lane = laneEndCols.findIndex((endCol) => endCol < seg.startCol);
    if (lane === -1) {
      lane = laneEndCols.length;
      laneEndCols.push(seg.startCol + seg.span - 1);
    } else {
      laneEndCols[lane] = seg.startCol + seg.span - 1;
    }
    segments.push({
      item: seg.item,
      startCol: seg.startCol,
      span: seg.span,
      lane,
      continuesBefore: seg.continuesBefore,
      continuesAfter: seg.continuesAfter,
    });
  }
  return segments;
}
