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
});
