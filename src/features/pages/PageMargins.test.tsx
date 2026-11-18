import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { CSSProperties } from "react";
import { usePageMargins } from "./PageMargins";

const prototype = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(prototype, "close");

beforeAll(() => {
  Object.defineProperties(prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
  });
});

afterAll(() => {
  Reflect.deleteProperty(prototype, "showModal");
  Reflect.deleteProperty(prototype, "close");
  if (originalShow) Object.defineProperty(prototype, "showModal", originalShow);
  if (originalClose) Object.defineProperty(prototype, "close", originalClose);
});

beforeEach(() => localStorage.clear());

function Page({ pageId, enabled = true }: { pageId: string; enabled?: boolean }) {
  const { contentRef, dialog, style } = usePageMargins(pageId, enabled);
  return (
    <div ref={(element) => {
      if (element) Object.defineProperty(element, "clientWidth", { configurable: true, value: 900 });
    }}>
      {dialog}
      <div ref={contentRef} data-testid="page-content" style={{
        "--page-default-max-width": "778px",
        "--page-default-left": "64px",
        "--page-default-right": "64px",
        "--page-default-top": "48px",
        "--page-default-bottom": "120px",
        ...style,
      } as CSSProperties} />
    </div>
  );
}

function shortcut(key: string) {
  fireEvent.keyDown(window, { key });
}

it("opens with the actual margins and applies live changes only to the page content", () => {
  render(<Page pageId="one" />);
  shortcut("F7");
  expect(screen.getByRole("dialog", { name: "페이지 여백 설정" })).toBeInTheDocument();
  expect(screen.getByLabelText("왼쪽 여백")).toHaveValue(125);
  expect(screen.getByLabelText("오른쪽 여백")).toHaveValue(125);
  expect(screen.getByLabelText("위쪽 여백")).toHaveValue(48);
  expect(screen.getByLabelText("아래쪽 여백")).toHaveValue(120);

  fireEvent.change(screen.getByLabelText("왼쪽 여백"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "오른쪽 여백 줄이기" }));
  fireEvent.click(screen.getByRole("button", { name: "위쪽 여백 늘리기" }));
  fireEvent.change(screen.getByLabelText("아래쪽 여백"), { target: { value: "20" } });
  expect(screen.getByTestId("page-content")).toHaveStyle({ maxWidth: "none", padding: "49px 124px 20px 10px" });
  shortcut("Escape");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByTestId("page-content").style.padding).toBe("");
  expect(localStorage.getItem("wegoinn.page-margins.one")).toBeNull();
});

it("persists by page, cancels with F7, and restores the responsive defaults on apply", () => {
  const { unmount } = render(<Page pageId="one" />);
  shortcut("F7");
  fireEvent.change(screen.getByLabelText("왼쪽 여백"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  unmount();

  const { rerender } = render(<Page key="two" pageId="two" />);
  expect(screen.getByTestId("page-content").style.padding).toBe("");
  rerender(<Page key="one" pageId="one" />);
  expect(screen.getByTestId("page-content").style.paddingLeft).toBe("12px");
  shortcut("F7");
  expect(screen.getByLabelText("왼쪽 여백")).toHaveValue(12);
  fireEvent.click(screen.getByRole("button", { name: "기본값 복원" }));
  expect(screen.getByLabelText("왼쪽 여백")).toHaveValue(125);
  expect(screen.getByTestId("page-content").style.padding).toBe("");
  shortcut("F7");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByTestId("page-content").style.paddingLeft).toBe("12px");

  shortcut("F7");
  fireEvent.click(screen.getByRole("button", { name: "기본값 복원" }));
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  expect(screen.getByTestId("page-content").style.padding).toBe("");
  expect(localStorage.getItem("wegoinn.page-margins.one")).toBeNull();
});

it("leaves F7 inactive outside the detail panel", () => {
  render(<Page pageId="one" enabled={false} />);
  shortcut("F7");
  expect(screen.queryByRole("dialog")).toBeNull();
});
