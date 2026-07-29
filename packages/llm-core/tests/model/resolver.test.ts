import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import type { CapabilityRequirement } from "#contracts";
import {
  BUILTIN_DEPLOYMENT,
  BUILTIN_PROVIDER,
  BUILTIN_TEXT_CAPABILITY,
  createBuiltinModelProfile,
  createModelResolver,
  deploymentRef,
  modelProfileId,
  modelRef,
  providerRef,
  type ModelBinding,
  type ModelProfile,
} from "../../src/features/model/public";

const M1 = modelRef("m1");
const M2 = modelRef("m2");

const withModel = (profile: ModelProfile, model = M1): ModelProfile => ({ ...profile, model });

const bareProfile = (model = M1): ModelProfile => ({
  profileId: modelProfileId("bare"),
  version: contractVersion("1.0.0"),
  model,
  provider: providerRef("bare.provider"),
  deployment: deploymentRef("bare.deployment"),
  claims: [],
});

const binding = (
  bindingId: string,
  model = M1,
  options: { aliases?: typeof M1[]; profile?: ModelProfile } = {},
): ModelBinding => ({
  bindingId,
  model,
  provider: BUILTIN_PROVIDER,
  deployment: BUILTIN_DEPLOYMENT,
  profile: options.profile ?? withModel(createBuiltinModelProfile(), model),
  aliases: options.aliases,
});

const TEXT_REQ: CapabilityRequirement[] = [{ capabilityId: BUILTIN_TEXT_CAPABILITY }];

describe("model resolver", () => {
  test("resolves an exact model selection", () => {
    const outcome = createModelResolver().resolve({ selection: M1, bindings: [binding("a", M1)] });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.resolution.matchedBy).toBe("exact");
    expect(outcome.resolution.binding.bindingId).toBe("a");
  });

  test("resolves through a policy alias when no exact match exists", () => {
    const outcome = createModelResolver().resolve({
      selection: M2,
      bindings: [binding("a", M1, { aliases: [M2] })],
    });
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.resolution.matchedBy).toBe("alias");
  });

  test("prefers an exact binding over an alias", () => {
    const outcome = createModelResolver().resolve({
      selection: M1,
      bindings: [binding("exact", M1), binding("aliased", M2, { aliases: [M1] })],
    });
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.resolution.binding.bindingId).toBe("exact");
    expect(outcome.resolution.matchedBy).toBe("exact");
  });

  test("excludes bindings lacking a required capability", () => {
    const outcome = createModelResolver().resolve({
      selection: M1,
      requiredCapabilities: TEXT_REQ,
      bindings: [binding("bare", M1, { profile: bareProfile() })],
    });
    expect(outcome.kind).toBe("unresolved");
    if (outcome.kind !== "unresolved") return;
    expect(outcome.reason).toBe("no-eligible-binding");
  });

  test("resolves when the binding carries the required capability claim", () => {
    const outcome = createModelResolver().resolve({
      selection: M1,
      requiredCapabilities: TEXT_REQ,
      bindings: [binding("a", M1)],
    });
    expect(outcome.kind).toBe("resolved");
  });

  test("fails as ambiguous when multiple eligible bindings match", () => {
    const outcome = createModelResolver().resolve({
      selection: M1,
      bindings: [binding("a", M1), binding("b", M1)],
    });
    expect(outcome.kind).toBe("unresolved");
    if (outcome.kind !== "unresolved") return;
    expect(outcome.reason).toBe("ambiguous");
  });

  test("fails when a model is omitted and no default is named", () => {
    const outcome = createModelResolver().resolve({ bindings: [binding("a", M1)] });
    expect(outcome.kind).toBe("unresolved");
    if (outcome.kind !== "unresolved") return;
    expect(outcome.reason).toBe("unknown-selection");
  });

  test("uses the named default model and records the choice", () => {
    const outcome = createModelResolver().resolve({
      bindings: [binding("a", M1)],
      policy: { defaultModel: M1 },
    });
    if (outcome.kind !== "resolved") throw new Error("expected resolved");
    expect(outcome.resolution.matchedBy).toBe("default");
  });

  test("resolution is independent of ambient credentials", () => {
    const original = process.env.OPENAI_API_KEY;
    const resolver = createModelResolver();
    const baseline = resolver.resolve({ selection: M1, bindings: [binding("a", M1)] });
    process.env.OPENAI_API_KEY = "sk-ignored";
    const withEnv = resolver.resolve({ selection: M1, bindings: [binding("a", M1)] });
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
    expect(withEnv).toEqual(baseline);
  });
});
