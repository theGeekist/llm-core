import { describe, expect, it } from "bun:test";
import {
  extensionNamespace,
  isJsonValue,
  isNativeExtensions,
  nativeExtensions,
} from "../../src/contracts/extensions";

describe("native extensions", () => {
  it("requires lowercase reverse-DNS namespaces", () => {
    expect(String(extensionNamespace("com.openai.responses"))).toBe("com.openai.responses");
    expect(() => extensionNamespace("OpenAI.responses")).toThrow();
    expect(() => extensionNamespace("provider")).toThrow();
  });

  it("accepts finite, recursively JSON-compatible values", () => {
    expect(isJsonValue({ enabled: true, nested: [null, "value", 3] })).toBe(true);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
  });

  it("preserves unknown namespaced extension values through JSON round-trip", () => {
    const extensions = nativeExtensions({
      "com.openai.responses": {
        responseId: "resp_123",
        nested: { futureField: [1, 2, 3] },
      },
      "dev.langchain.runtime": { checkpoint: true },
    });

    const roundTrip = JSON.parse(JSON.stringify(extensions)) as unknown;
    expect(roundTrip).toEqual(extensions);
    expect(isNativeExtensions(roundTrip)).toBe(true);
  });

  it("rejects invalid namespaces and non-JSON values", () => {
    expect(isNativeExtensions({ "OpenAI.responses": { responseId: "resp_123" } })).toBe(false);
    expect(isNativeExtensions({ "com.openai.responses": { value: undefined } })).toBe(false);
    expect(isNativeExtensions(new Date())).toBe(false);
    expect(isNativeExtensions(Object.create({ inherited: true }))).toBe(false);
    expect(() => nativeExtensions({ "com.openai.responses": { value: undefined } })).toThrow();
  });
});
