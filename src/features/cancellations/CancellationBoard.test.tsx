import { vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CancellationBoard } from "./CancellationBoard";
import { EMPTY_FILTERS, filterCancellations, isCancellationPath, sortCancellations, summarize } from "./cancellationUtils";
import { MOCK_CANCELLATIONS } from "./mockCancellations";
import type { CancellationRecord } from "./types";

const partial: CancellationRecord = { ...MOCK_CANCELLATIONS[0], id: "p", cancellationRate: 50, manager: "Mina", cancelDate: "2026-09-05" };
const rows = [...MOCK_CANCELLATIONS, partial];

describe("cancellation utils", () => {
  it("matches the Korean route in raw and percent-encoded form", () => {
    expect(isCancellationPath("/취소확인")).toBe(true);
    expect(isCancellationPath(encodeURI("/취소확인"))).toBe(true);
    expect(isCancellationPath("/handover")).toBe(false);
    expect(isCancellationPath("/%E0%A4%A")).toBe(false);
  });

  it("filters by date range, manager, rate and query", () => {
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, from: "2026-09-02" }).map((r) => r.id)).toEqual(["sample-2", "p"]);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, to: "2026-09-01" }).map((r) => r.id)).toEqual(["sample-1"]);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, manager: "Been" }).map((r) => r.id)).toEqual(["sample-2"]);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, rate: "partial" }).map((r) => r.id)).toEqual(["p"]);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, rate: "full" })).toHaveLength(2);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, query: "jade" }).map((r) => r.id)).toEqual(["sample-2"]);
    expect(filterCancellations(rows, { ...EMPTY_FILTERS, query: "2028070" }).map((r) => r.id)).toEqual(["sample-1", "p"]);
  });

  it("sorts by date and rate", () => {
    expect(sortCancellations(rows, { key: "checkInDate", dir: "asc" })[0].id).toBe("sample-2");
    expect(sortCancellations(rows, { key: "cancellationRate", dir: "asc" })[0].id).toBe("p");
    expect(sortCancellations(rows, { key: "cancelDate", dir: "desc" })[0].id).toBe("p");
  });

  it("summarizes", () => {
    expect(summarize(rows)).toEqual({ total: 3, full: 2, managerCount: 3, latestCancelDate: "2026-09-05" });
    expect(summarize([])).toEqual({ total: 0, full: 0, managerCount: 0, latestCancelDate: null });
  });
});

describe("CancellationBoard", () => {
  it("shows the empty state by default and never shows sample rows unasked", () => {
    render(<CancellationBoard />);
    expect(screen.getByText("등록된 무료 취소내역이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("Fung Yee")).not.toBeInTheDocument();
  });

  it("previews sample data with search, reset and copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CancellationBoard />);
    fireEvent.click(screen.getByText("샘플 데이터로 미리보기"));
    expect(screen.getByText("샘플 데이터 · 저장되지 않음")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Fung Yee")).toBeInTheDocument();
    expect(within(table).getByText("Jade Du")).toBeInTheDocument();
    expect(screen.getByText("총 2건 중 1-2건")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("예약번호 또는 성함으로 검색"), { target: { value: "104159048" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(within(table).queryByText("Fung Yee")).not.toBeInTheDocument();
    expect(within(table).getByText("Jade Du")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "초기화" })[0]);
    expect(within(screen.getByRole("table")).getByText("Fung Yee")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("table")).getByLabelText("예약번호 202807035 복사"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("202807035"));
    expect(await within(screen.getByRole("table")).findByText("복사됨")).toBeInTheDocument();
  });
});
