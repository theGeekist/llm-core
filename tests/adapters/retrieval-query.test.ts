import { describe, expect, it } from "bun:test";
import type { StructuredContent } from "#adapters";
import { toQueryText } from "#adapters";

describe("Adapter retrieval query", () => {
  it("uses structured text when available", () => {
    const query: StructuredContent = {
      text: "query",
      parts: [{ type: "text", text: "fallback" }],
    };

    expect(toQueryText(query)).toBe("query");
  });

  it("falls back to concatenated text parts", () => {
    const query: StructuredContent = {
      text: "",
      parts: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };

    expect(toQueryText(query)).toBe("firstsecond");
  });

  it("returns empty string for empty structured content", () => {
    const query: StructuredContent = { text: "", parts: [] };
    expect(toQueryText(query)).toBe("");
  });
});
