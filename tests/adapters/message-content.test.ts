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

  it("accepts mimeType metadata for binary parts", () => {
    const input = [{ type: "image", image: new Uint8Array([1]), mimeType: "image/gif" }];
    const content = toAdapterMessageContent(input);

    expect(content).toMatchObject({
      parts: [{ type: "image", mediaType: "image/gif" }],
    });
  });
});
