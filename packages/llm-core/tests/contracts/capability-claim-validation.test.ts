import { describe, expect, test } from "bun:test";
import type { CapabilityConstraint, ConformanceEvidence, NativeExtensions } from "#contracts";
import { isCapabilityClaim } from "../../src/contracts/capability-claim-validation";
import { isPortableRecord } from "../../src/shared/portable-data";

const isEvidence = (value: unknown): value is ConformanceEvidence =>
  isPortableRecord(value) &&
  (value.result === "pass" || value.result === "partial" || value.result === "fail");

const validators = {
  isCapabilityId: (value: unknown) => value === "llm-core.test.capability",
  isContractVersion: (value: unknown) => value === "1.0.0",
  isEvidence,
  isConstraint: (value: unknown): value is CapabilityConstraint =>
    isPortableRecord(value) && typeof value.name === "string" && Object.hasOwn(value, "value"),
  isExtensions: (value: unknown): value is NativeExtensions => isPortableRecord(value),
};

const supportedClaim = () => ({
  capabilityId: "llm-core.test.capability",
  version: "1.0.0",
  status: "supported",
  evidence: { result: "pass" },
});

describe("capability claim structural validation", () => {
  test("rejects inherited and undeclared claim properties", () => {
    const inherited = Object.assign(Object.create({ status: "supported" }), {
      capabilityId: "llm-core.test.capability",
      version: "1.0.0",
      evidence: { result: "pass" },
    });

    expect(isCapabilityClaim(inherited, validators)).toBe(false);
    expect(isCapabilityClaim({ ...supportedClaim(), credential: "secret" }, validators)).toBe(
      false,
    );
  });

  test("normalizes accessor and hostile proxy claims without reading accessor values", () => {
    let statusReads = 0;
    const accessor = Object.defineProperty(supportedClaim(), "status", {
      enumerable: true,
      get: () => {
        statusReads += 1;
        return "supported";
      },
    });
    expect(isCapabilityClaim(accessor, validators)).toBe(false);
    expect(statusReads).toBe(0);

    const throwingRead = new Proxy(supportedClaim(), {
      get: (target, key, receiver) => {
        if (key === "capabilityId") throw new Error("hostile read trap");
        return Reflect.get(target, key, receiver);
      },
    });
    expect(isCapabilityClaim(throwingRead, validators)).toBe(false);
  });

  test("enforces status consistency across all evidence", () => {
    expect(
      isCapabilityClaim(
        {
          ...supportedClaim(),
          additionalEvidence: [{ result: "fail" }],
        },
        validators,
      ),
    ).toBe(false);
    expect(
      isCapabilityClaim(
        {
          ...supportedClaim(),
          additionalEvidence: [{ result: "pass" }],
        },
        validators,
      ),
    ).toBe(true);
  });

  test("requires own non-empty conditions only for conditional claims", () => {
    const conditional = {
      ...supportedClaim(),
      status: "conditional",
      evidence: { result: "partial" },
      conditions: [{ name: "region", value: "sg" }],
    };
    expect(isCapabilityClaim(conditional, validators)).toBe(true);
    expect(isCapabilityClaim({ ...conditional, conditions: [] }, validators)).toBe(false);
    expect(
      isCapabilityClaim({ ...supportedClaim(), conditions: conditional.conditions }, validators),
    ).toBe(false);
  });
});
