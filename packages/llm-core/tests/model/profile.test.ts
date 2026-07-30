import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import type { CapabilityClaim, ContractVersion } from "#contracts";
import {
  createBuiltinModelProfile,
  deploymentRef,
  modelProfileId,
  modelRef,
  providerRef,
  registerModelProfile,
  type ModelProfile,
} from "../../src/features/model/public";

const baseProfile = (): ModelProfile => {
  const builtin = createBuiltinModelProfile();
  return {
    profileId: builtin.profileId,
    version: builtin.version,
    model: builtin.model,
    provider: builtin.provider,
    deployment: builtin.deployment,
    claims: [...builtin.claims],
  };
};

describe("builtin model profile provenance", () => {
  test("capability claims cite versioned conformance evidence", () => {
    const profile = createBuiltinModelProfile();
    const [claim] = profile.claims;
    expect(claim).toBeDefined();
    if (!claim || claim.status !== "supported") return;

    expect(claim.evidence.result).toBe("pass");
    expect(claim.evidence.suiteVersion as string).toBe("1.0.0");
    expect(claim.evidence.providerId).toBe("llm-core.builtin");
    expect(claim.evidence.providerVersion).toBe("1.0.0");
    expect(claim.evidence.report.content.digest.algorithm).toBe("sha-256");
    expect(claim.evidence.report.content.digest.value).toMatch(/^[0-9a-f]{64}$/);
  });

  test("profile is versioned and references a provider and deployment", () => {
    const profile = createBuiltinModelProfile();
    expect(profile.version as string).toBe("1.0.0");
    expect(typeof profile.provider).toBe("string");
    expect(typeof profile.deployment).toBe("string");
  });

  test("the builtin profile is deeply frozen so evidence cannot mutate", () => {
    const profile = createBuiltinModelProfile();
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.claims)).toBe(true);
    const [claim] = profile.claims;
    if (!claim || claim.status !== "supported") return;
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.evidence)).toBe(true);
    expect(Object.isFrozen(claim.evidence.report.content)).toBe(true);
  });
});

describe("model profile registration", () => {
  test("deep-clones so later source mutation cannot affect the registered profile", () => {
    const claims = [...createBuiltinModelProfile().claims];
    const [first] = claims;
    expect(first).toBeDefined();
    if (!first) return;
    const source: ModelProfile = {
      profileId: modelProfileId("registered"),
      version: contractVersion("1.0.0"),
      model: modelRef("m"),
      provider: providerRef("pr"),
      deployment: deploymentRef("d"),
      claims,
    };
    const registered = registerModelProfile(source);
    claims.push(first); // mutate the source array after registration
    expect(registered.claims.length).toBe(1);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.claims)).toBe(true);
  });

  test("rejects a profile with an invalid version", () => {
    expect(() =>
      registerModelProfile({
        profileId: modelProfileId("bad"),
        version: "not-semver" as unknown as ContractVersion,
        model: modelRef("m"),
        provider: providerRef("pr"),
        deployment: deploymentRef("d"),
        claims: [],
      }),
    ).toThrow();
  });

  test("rejects a supported claim with malformed (empty) evidence", () => {
    const malformed = {
      capabilityId: "llm-core.model.text-generation",
      version: contractVersion("1.0.0"),
      status: "supported",
      evidence: {},
    } as unknown as CapabilityClaim;
    expect(() => registerModelProfile({ ...baseProfile(), claims: [malformed] })).toThrow();
  });

  test("rejects a claim with a non-namespaced capability id", () => {
    const [good] = baseProfile().claims;
    if (!good) throw new Error("expected a builtin claim");
    const badId = { ...good, capabilityId: "InvalidID" } as unknown as CapabilityClaim;
    expect(() => registerModelProfile({ ...baseProfile(), claims: [badId] })).toThrow();
  });

  test("rejects extensions containing a non-JSON value", () => {
    expect(() =>
      registerModelProfile({
        ...baseProfile(),
        extensions: { "com.example.vendor": { when: new Date() } } as never,
      }),
    ).toThrow();
  });

  test("rejects extensions with an invalid namespace key", () => {
    expect(() =>
      registerModelProfile({
        ...baseProfile(),
        extensions: { NotReverseDNS: { a: 1 } } as never,
      }),
    ).toThrow();
  });

  test("rejects an undeclared root key such as a stray credential", () => {
    expect(() =>
      registerModelProfile({ ...baseProfile(), credential: "raw-secret" } as never),
    ).toThrow();
  });

  test("rejects a physical locator smuggled into evidence", () => {
    const [good] = baseProfile().claims;
    if (!good || good.status !== "supported") throw new Error("expected a supported builtin claim");
    const leaky = {
      ...good,
      evidence: { ...good.evidence, signedUrl: "https://example.com/token" },
    } as unknown as CapabilityClaim;
    expect(() => registerModelProfile({ ...baseProfile(), claims: [leaky] })).toThrow();
  });

  test("rejects malformed media types in conformance evidence", () => {
    const [good] = baseProfile().claims;
    if (!good || good.status !== "supported") throw new Error("expected a supported builtin claim");
    for (const mediaType of [
      "application/json garbage",
      'application/json; profile="unterminated',
      'application/json; profile="line\nbreak"',
    ]) {
      const malformed = {
        ...good,
        evidence: {
          ...good.evidence,
          report: {
            ...good.evidence.report,
            content: {
              ...good.evidence.report.content,
              mediaType,
            },
          },
        },
      } as unknown as CapabilityClaim;

      expect(() => registerModelProfile({ ...baseProfile(), claims: [malformed] })).toThrow(
        TypeError,
      );
    }
  });

  test("rejects semantically invalid RFC 3339 evidence timestamps", () => {
    const [good] = baseProfile().claims;
    if (!good || good.status !== "supported") throw new Error("expected a supported builtin claim");

    for (const observedAt of [
      "2026-99-99T99:99:99Z",
      "2026-02-29T00:00:00Z",
      "2024-02-30T00:00:00Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:00:00+24:00",
    ]) {
      const malformed = {
        ...good,
        evidence: { ...good.evidence, observedAt },
      } as unknown as CapabilityClaim;
      expect(() => registerModelProfile({ ...baseProfile(), claims: [malformed] })).toThrow(
        TypeError,
      );
    }
  });

  test("accepts valid leap-day and offset RFC 3339 evidence timestamps", () => {
    const [good] = baseProfile().claims;
    if (!good || good.status !== "supported") throw new Error("expected a supported builtin claim");
    const valid = {
      ...good,
      evidence: {
        ...good.evidence,
        observedAt: "2024-02-29T23:59:59.123+08:00",
        report: {
          ...good.evidence.report,
          content: {
            ...good.evidence.report.content,
            mediaType: "application/json; charset=utf-8",
          },
        },
      },
    } as unknown as CapabilityClaim;

    expect(() => registerModelProfile({ ...baseProfile(), claims: [valid] })).not.toThrow();
  });

  test("accepts RFC 3339 lowercase separators and possible leap seconds", () => {
    const [good] = baseProfile().claims;
    if (!good || good.status !== "supported") throw new Error("expected a supported builtin claim");

    for (const observedAt of ["1990-12-31t23:59:60z", "1991-01-01T07:59:60+08:00"]) {
      const valid = {
        ...good,
        evidence: { ...good.evidence, observedAt },
      } as unknown as CapabilityClaim;
      expect(() => registerModelProfile({ ...baseProfile(), claims: [valid] })).not.toThrow();
    }
  });
});
