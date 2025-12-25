import { describe, expect, it } from "bun:test";
import { toBytes } from "../../src/adapters/binary.ts";

const toText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("Adapter binary helpers", () => {
  it("passes through Uint8Array inputs", () => {
    const bytes = new Uint8Array([65, 66, 67]);
    expect(toBytes(bytes)).toBe(bytes);
  });

  it("decodes base64 with Buffer when available", () => {
    const bytes = toBytes("aGVsbG8=");
    expect(toText(bytes)).toBe("hello");
  });

  it("decodes base64 with atob when Buffer is unavailable", () => {
    const originalBuffer = globalThis.Buffer;
    const originalAtob = globalThis.atob;
    const fallbackAtob = (value: string) =>
      originalBuffer ? originalBuffer.from(value, "base64").toString("binary") : "";

    try {
      (globalThis as { Buffer?: typeof Buffer }).Buffer = undefined;
      globalThis.atob = fallbackAtob;
      const bytes = toBytes("aGVsbG8=");
      expect(toText(bytes)).toBe("hello");
    } finally {
      (globalThis as { Buffer?: typeof Buffer }).Buffer = originalBuffer;
      globalThis.atob = originalAtob;
    }
  });
});
