import { describe, it, expect } from "vitest";
import { layoutWeekSegments } from "./calendarLayout";

const week = ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"];

describe("layoutWeekSegments", () => {
  it("places a single-day event at its own column with span 1", () => {
    const segments = layoutWeekSegments(week, [{ id: "a", startDate: "2026-08-11", endDate: "2026-08-11" }]);
    expect(segments).toEqual([
      { item: { id: "a", startDate: "2026-08-11", endDate: "2026-08-11" }, startCol: 2, span: 1, lane: 0, continuesBefore: false, continuesAfter: false },
    ]);
  });

  it("spans a multi-day event across the correct columns", () => {
    const segments = layoutWeekSegments(week, [{ id: "vacation", startDate: "2026-08-10", endDate: "2026-08-14" }]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startCol: 1, span: 5, lane: 0, continuesBefore: false, continuesAfter: false });
  });

  it("clips a range that starts before and ends after this row", () => {
    const segments = layoutWeekSegments(week, [{ id: "long", startDate: "2026-08-01", endDate: "2026-08-31" }]);
    expect(segments[0]).toMatchObject({ startCol: 0, span: 7, continuesBefore: true, continuesAfter: true });
  });

  it("stacks overlapping events into separate lanes", () => {
    const segments = layoutWeekSegments(week, [
      { id: "a", startDate: "2026-08-10", endDate: "2026-08-12" },
      { id: "b", startDate: "2026-08-11", endDate: "2026-08-13" },
    ]);
    const a = segments.find((s) => s.item.id === "a")!;
    const b = segments.find((s) => s.item.id === "b")!;
    expect(a.lane).not.toBe(b.lane);
  });

  it("reuses a lane once the earlier event's columns are past", () => {
    const segments = layoutWeekSegments(week, [
      { id: "a", startDate: "2026-08-09", endDate: "2026-08-10" },
      { id: "b", startDate: "2026-08-11", endDate: "2026-08-12" },
    ]);
    expect(segments.find((s) => s.item.id === "a")!.lane).toBe(0);
    expect(segments.find((s) => s.item.id === "b")!.lane).toBe(0);
  });

  it("ignores events with no overlap in this row", () => {
    const segments = layoutWeekSegments(week, [{ id: "later", startDate: "2026-09-01", endDate: "2026-09-02" }]);
    expect(segments).toEqual([]);
  });

  it("handles reversed start/end input defensively", () => {
    const segments = layoutWeekSegments(week, [{ id: "flipped", startDate: "2026-08-13", endDate: "2026-08-10" }]);
    expect(segments[0]).toMatchObject({ startCol: 1, span: 4 });
  });

  it("respects leading padding (null) cells in the first week of a month", () => {
    const paddedWeek = [null, null, "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];
    const segments = layoutWeekSegments(paddedWeek, [{ id: "a", startDate: "2026-07-30", endDate: "2026-08-02" }]);
    expect(segments[0]).toMatchObject({ startCol: 2, span: 2, continuesBefore: true, continuesAfter: false });
  });
});
