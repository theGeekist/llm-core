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
    const accepted = { enabled: true, nested: [null, "value", 3] };
    expect(isJsonValue(accepted)).toBe(true);
    expect(JSON.parse(JSON.stringify(accepted))).toEqual(accepted);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
  });

  it("rejects object graphs that do not round-trip as JSON data", () => {
    const sparse = new Array(2);
    sparse[1] = "value";

    const symbolBearing = { visible: true, [Symbol("hidden")]: "value" };
    const accessor = {};
    let getterReads = 0;
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return "value";
      },
    });

    expect(isJsonValue(sparse)).toBe(false);
    expect(isJsonValue(symbolBearing)).toBe(false);
    expect(isJsonValue(accessor)).toBe(false);
    expect(getterReads).toBe(0);
  });

  it("rejects proxies without reading their projected values", () => {
    let getReads = 0;
    const proxy = new Proxy(
      { visible: "safe" },
      {
        get: () => {
          getReads += 1;
          return "unsafe";
        },
      },
    );

    expect(isJsonValue(proxy)).toBe(false);
    expect(isJsonValue({ nested: proxy })).toBe(false);
    expect(
      isNativeExtensions({
        "com.openai.responses": proxy,
      }),
    ).toBe(false);
    expect(getReads).toBe(0);
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
    let getterReads = 0;
    const accessorExtensions = {};
    Object.defineProperty(accessorExtensions, "com.openai.responses", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return { responseId: "resp_123" };
      },
    });
    expect(isNativeExtensions(accessorExtensions)).toBe(false);
    expect(getterReads).toBe(0);
    expect(() => nativeExtensions({ "com.openai.responses": { value: undefined } })).toThrow();
  });
});
