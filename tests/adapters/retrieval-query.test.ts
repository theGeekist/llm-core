import { describe, expect, it } from "bun:test";
import type { AdapterStructuredContent } from "#adapters";
import { toQueryText } from "#adapters";

describe("Adapter retrieval query", () => {
  it("uses structured text when available", () => {
    const query: AdapterStructuredContent = {
      text: "query",
      parts: [{ type: "text", text: "fallback" }],
    };

    expect(toQueryText(query)).toBe("query");
  });

  it("falls back to concatenated text parts", () => {
    const query: AdapterStructuredContent = {
      text: "",
      parts: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };

    expect(toQueryText(query)).toBe("firstsecond");
  });

  it("returns empty string for empty structured content", () => {
    const query: AdapterStructuredContent = { text: "", parts: [] };
    expect(toQueryText(query)).toBe("");
  });
});
