import { describe, it, expect } from "vitest";
import { extensionOf, isAllowedExtension, createPageSchema, updatePageMetaSchema, attachmentInitSchema } from "../lib/validation";

describe("extensionOf / isAllowedExtension", () => {
  it("extracts the lowercase extension", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("no-extension")).toBe("");
  });

  it("allows only the whitelisted document/image types", () => {
    expect(isAllowedExtension("pdf")).toBe(true);
    expect(isAllowedExtension("hwpx")).toBe(true);
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
});
