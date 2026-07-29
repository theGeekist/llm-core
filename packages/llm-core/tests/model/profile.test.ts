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
    expect(claim.evidence.report.content.digest.algorithm).toBe("sha-256");
    expect(claim.evidence.report.content.digest.value).toMatch(/^[0-9a-f]{64}$/);
  });

  test("profile is versioned and references a provider and deployment", () => {
    const profile = createBuiltinModelProfile();
    expect(profile.version as string).toBe("1.0.0");
    expect(typeof profile.provider).toBe("string");
    expect(typeof profile.deployment).toBe("string");
  });
});
