import { describe, it, expect } from "vitest";
import { extensionOf, isAllowedExtension, createPageSchema, updatePageMetaSchema, attachmentInitSchema, pageContentSchema } from "../lib/validation";

describe("extensionOf / isAllowedExtension", () => {
  it("extracts the lowercase extension", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("no-extension")).toBe("");
  });

  it("allows only the whitelisted document/image types", () => {
    expect(isAllowedExtension("pdf")).toBe(true);
    expect(isAllowedExtension("hwpx")).toBe(true);
    expect(isAllowedExtension("ppt")).toBe(true);
    expect(isAllowedExtension("PPTX")).toBe(true);
    expect(isAllowedExtension("exe")).toBe(false);
    expect(isAllowedExtension("sh")).toBe(false);
  });
});

describe("zod schemas", () => {
  it("accepts a minimal page creation payload", () => {
    expect(() => createPageSchema.parse({})).not.toThrow();
    expect(() => createPageSchema.parse({ title: "제목" })).not.toThrow();
  });

  it("requires expectedVersion on meta updates", () => {
    expect(() => updatePageMetaSchema.parse({ title: "x" })).toThrow();
    expect(() => updatePageMetaSchema.parse({ expectedVersion: 1, title: "x" })).not.toThrow();
  });

  it("rejects a zero/negative attachment size", () => {
    expect(() =>
      attachmentInitSchema.parse({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 0 }),
    ).toThrow();
  });

  it("accepts the extended editor and database blocks", () => {
    expect(() =>
      pageContentSchema.parse({
        blocks: [
          { id: "code-1", type: "code", text: "const ready = true;", language: "typescript" },
          { id: "math-1", type: "equation", text: "a² + b² = c²" },
          {
            id: "db-1",
            type: "database_view",
            view: "timeline",
            properties: ["category", "description", "tags", "updatedAt"],
            filter: { field: "tags", op: "contains", value: "계약서" },
            groupBy: "category",
          },
          { id: "button-1", type: "button", label: "객실 수리 요청", templateKey: "room_repair" },
        ],
      }),
    ).not.toThrow();
  });
});
