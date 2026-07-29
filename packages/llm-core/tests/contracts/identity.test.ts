import { describe, expect, it } from "bun:test";
import {
  coreId,
  externalId,
  isCanonicalUuid,
  isSpanId,
  isTraceId,
  isUuidV7,
  newCoreId,
  secretRef,
  spanId,
  traceFlags,
  traceId,
} from "../../src/contracts/identity";
import type { InvocationId, PrincipalId } from "../../src/contracts/identity";

const UUID_V4 = "f81d4fae-7dec-4f0d-a765-00a0c91e6bf6";
const UUID_V7 = "01890f3e-3e30-7cc4-98c8-4d1f3c35ca10";

describe("portable identity", () => {
  it("accepts canonical RFC UUIDs and requires UUIDv7 for new core IDs", () => {
    expect(isCanonicalUuid(UUID_V4)).toBe(true);
    expect(isUuidV7(UUID_V7)).toBe(true);
    expect(String(coreId<InvocationId>(UUID_V4))).toBe(UUID_V4);
    expect(String(newCoreId<InvocationId>(UUID_V7))).toBe(UUID_V7);
  });

  it("rejects non-canonical or invalid core IDs", () => {
    expect(isCanonicalUuid(UUID_V4.toUpperCase())).toBe(false);
    expect(() => coreId<InvocationId>("invocation-1")).toThrow();
    expect(() => newCoreId<InvocationId>(UUID_V4)).toThrow();
  });

  it("accepts bounded printable external IDs without assigning UUID semantics", () => {
    expect(String(externalId<PrincipalId>("directory:user_123@example"))).toBe(
      "directory:user_123@example",
    );
    expect(() => externalId<PrincipalId>("contains whitespace")).toThrow();
    expect(() => externalId<PrincipalId>("")).toThrow();
    expect(() => externalId<PrincipalId>("a".repeat(256))).toThrow();
  });

  it("validates W3C trace and span identity independently", () => {
    const validTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const validSpanId = "00f067aa0ba902b7";

    expect(isTraceId(validTraceId)).toBe(true);
    expect(isSpanId(validSpanId)).toBe(true);
    expect(String(traceId(validTraceId))).toBe(validTraceId);
    expect(String(spanId(validSpanId))).toBe(validSpanId);
    expect(String(traceFlags("01"))).toBe("01");
    expect(isTraceId("0".repeat(32))).toBe(false);
    expect(isSpanId("0".repeat(16))).toBe(false);
  });

  it("keeps secret references opaque and credential-free", () => {
    expect(JSON.parse(JSON.stringify(secretRef("vault:production/model-token")))).toEqual({
      secretId: "vault:production/model-token",
    });
  });
});
