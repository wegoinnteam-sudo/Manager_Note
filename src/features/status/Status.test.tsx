import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { nextStatus, StatusBadge, STATUS_LABELS } from "./Status";

describe("nextStatus", () => {
  it("cycles through all four statuses and wraps around", () => {
    expect(nextStatus("in_progress")).toBe("handoff_pending");
    expect(nextStatus("handoff_pending")).toBe("done");
    expect(nextStatus("done")).toBe("on_hold");
    expect(nextStatus("on_hold")).toBe("in_progress");
  });
});

describe("StatusBadge", () => {
  it("shows the Korean label and calls onCycle when clicked", () => {
    const onCycle = vi.fn();
    render(<StatusBadge status="handoff_pending" onCycle={onCycle} />);
    const badge = screen.getByText(STATUS_LABELS.handoff_pending);
    fireEvent.click(badge);
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it("is disabled (no click) when no onCycle handler is given, e.g. read-only viewers", () => {
    render(<StatusBadge status="done" />);
    const badge = screen.getByText(STATUS_LABELS.done) as HTMLButtonElement;
    expect(badge.disabled).toBe(true);
  });
});
