import { describe, expect, test } from "bun:test";
import { createBuiltinModelProfile } from "../../src/features/model/public";

describe("builtin model profile provenance", () => {
  test("capability claims cite versioned conformance evidence", () => {
    const profile = createBuiltinModelProfile();
    const [claim] = profile.claims;
    expect(claim).toBeDefined();
    if (!claim) return;
    expect(claim.status).toBe("supported");
    if (claim.status !== "supported") return;

    // Evidence-backed provenance (ADR-004): suite identity, version, and an
    // integrity-bearing, storage-neutral evidence reference.
    expect(claim.evidence.result).toBe("pass");
    expect(claim.evidence.suiteVersion as string).toBe("1.0.0");
    expect(claim.evidence.providerId).toBe("llm-core.builtin");
    expect(claim.evidence.providerVersion).toBe("1.0.0");
    expect(claim.evidence.report.content.digest.algorithm).toBe("sha-256");
    expect(claim.evidence.report.content.digest.value).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the builtin profile is deeply frozen so evidence cannot mutate", () => {
    const profile = createBuiltinModelProfile();
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.claims)).toBe(true);
    const [claim] = profile.claims;
    expect(claim).toBeDefined();
    if (!claim || claim.status !== "supported") return;
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.evidence)).toBe(true);
    expect(Object.isFrozen(claim.evidence.report.content)).toBe(true);
  });

  test("profile is versioned and references a provider and deployment", () => {
    const profile = createBuiltinModelProfile();
    expect(profile.version as string).toBe("1.0.0");
    expect(typeof profile.provider).toBe("string");
    expect(typeof profile.deployment).toBe("string");
  });
});
