import { describe, expect, it } from "bun:test";
import type { AdapterStructuredContent } from "#adapters";
import { toAdapterMessageContent } from "#adapters";

describe("Adapter message content", () => {
  it("keeps structured content intact", () => {
    const structured: AdapterStructuredContent = {
      text: "hello",
      parts: [{ type: "text", text: "hello" }],
    };

    expect(toAdapterMessageContent(structured)).toBe(structured);
  });

  it("keeps tool parts", () => {
    const input = [
      { type: "tool-call", toolName: "search", toolCallId: "id-1", input: { q: "hi" } },
      { type: "tool-result", toolName: "search", toolCallId: "id-1", output: { ok: true } },
    ];

    const content = toAdapterMessageContent(input);
    expect(content).toMatchObject({
      text: "",
      parts: [
        { type: "tool-call", toolName: "search" },
        { type: "tool-result", toolName: "search" },
      ],
    });
  });

  it("keeps single tool part objects", () => {
    const input = { type: "tool-call", toolName: "lookup", input: { q: "hi" } };
    const content = toAdapterMessageContent(input);

    expect(content).toMatchObject({
      parts: [{ type: "tool-call", toolName: "lookup" }],
    });
  });

  it("preserves binary image and file parts", () => {
    const image = new Uint8Array([1, 2, 3]);
    const file = new Uint8Array([4, 5, 6]);
    const input = [
      { type: "image", image, mediaType: "image/png" },
      { type: "file", data: file, mediaType: "text/plain" },
    ];

    const content = toAdapterMessageContent(input);
    expect(content).toMatchObject({
      parts: [
        { type: "image", mediaType: "image/png" },
        { type: "file", mediaType: "text/plain" },
      ],
    });
  });

  it("handles URL and data URL images", () => {
    const input = [
      { type: "image", image: new URL("https://example.com/image.png") },
      { type: "image", image: "data:image/png;base64,AAA" },
      { type: "image_url", image_url: { url: "https://example.com/other.png" } },
      { type: "image", image: "https://example.com/third.png" },
    ];

    const content = toAdapterMessageContent(input);
    expect(content).toMatchObject({
      parts: [
        { type: "image", url: "https://example.com/image.png" },
        { type: "image", data: "data:image/png;base64,AAA" },
        { type: "image", url: "https://example.com/other.png" },
        { type: "image", url: "https://example.com/third.png" },
      ],
    });
  });

  it("handles file URLs and string payloads", () => {
    const input = [
      { type: "file", data: new URL("https://example.com/file.txt") },
      { type: "file", data: "plain-text" },
    ];

    const content = toAdapterMessageContent(input);
    expect(content).toMatchObject({
      parts: [
        { type: "file", data: "https://example.com/file.txt" },
        { type: "file", data: "plain-text" },
      ],
    });
  });

  it("falls back to text shortcut when object has only text", () => {
    const content = toAdapterMessageContent({ text: "hello" });
    expect(content).toBe("hello");
  });

  it("handles ArrayBuffer and raw data parts", () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const content = toAdapterMessageContent([
      { type: "file", data: buffer },
      { type: "image", image: buffer },
      42,
    ]);

    expect(content).toMatchObject({
      parts: [{ type: "file" }, { type: "image" }, { type: "data", data: 42 }],
    });
  });

  it("handles Buffer payloads when available", () => {
    if (typeof Buffer === "undefined") {
      return;
    }
    const content = toAdapterMessageContent([
      { type: "image", image: Buffer.from([1, 2, 3]) },
      { type: "file", data: Buffer.from([4, 5]) },
    ]);

    expect(content).toMatchObject({
      parts: [{ type: "image" }, { type: "file" }],
    });
  });

  it("maps reasoning parts", () => {
    const content = toAdapterMessageContent([{ type: "reasoning", text: "step" }]);
    expect(content).toMatchObject({
      parts: [{ type: "reasoning", text: "step" }],
    });
  });

  it("returns string inputs as-is", () => {
    expect(toAdapterMessageContent("hello")).toBe("hello");
  });

  it("uses btoa fallback when Buffer is unavailable", () => {
    if (typeof Buffer === "undefined") {
      return;
    }
    const globalScope = globalThis as { Buffer?: typeof Buffer };
    const previous = globalScope.Buffer;
    globalScope.Buffer = undefined;
    try {
      const content = toAdapterMessageContent([{ type: "image", image: new Uint8Array([1]) }]);
      expect(content).toMatchObject({ parts: [{ type: "image" }] });
    } finally {
      globalScope.Buffer = previous;
    }
  });

  it("wraps unknown objects into data parts", () => {
    const content = toAdapterMessageContent({ foo: "bar" });
    expect(content).toMatchObject({
      parts: [{ type: "data", data: { foo: "bar" } }],
    });
  });

  it("accepts mimeType metadata for binary parts", () => {
    const input = [{ type: "image", image: new Uint8Array([1]), mimeType: "image/gif" }];
    const content = toAdapterMessageContent(input);

    expect(content).toMatchObject({
      parts: [{ type: "image", mediaType: "image/gif" }],
    });
  });
});
