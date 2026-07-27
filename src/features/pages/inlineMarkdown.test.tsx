import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderInline } from "./inlineMarkdown";

function Wrapper({ text }: { text: string }) {
  return <div data-testid="out">{renderInline(text)}</div>;
}

describe("renderInline", () => {
  it("renders bold, italic, underline and links as real elements", () => {
    render(<Wrapper text="이것은 **굵게** *기울임* __밑줄__ [링크](https://example.com) 텍스트" />);
    const container = screen.getByTestId("out");
    expect(container.querySelector("strong")?.textContent).toBe("굵게");
    expect(container.querySelector("em")?.textContent).toBe("기울임");
    expect(container.querySelector("u")?.textContent).toBe("밑줄");
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("링크");
    expect(link?.getAttribute("href")).toBe("https://example.com");
  });

  it("never turns a javascript: link into a clickable href (XSS guard)", () => {
    render(<Wrapper text="[클릭](javascript:alert(1))" />);
    const link = screen.getByText("클릭") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("#");
  });

  it("renders plain text untouched when there is no markup", () => {
    render(<Wrapper text="일반 텍스트입니다" />);
    expect(screen.getByTestId("out").textContent).toBe("일반 텍스트입니다");
  });
});
