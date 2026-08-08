import { describe, expect, test } from "bun:test";
import {
  createIntegrationProposal,
  validateIntegrationArtifactBinding,
  validateIntegrationManifest,
} from "../../src/integrations/index.js";
import { acquisitionObservation, manifest } from "./fixtures/integration.js";

describe("integration authoring and validation", () => {
  test("creates a deterministic untrusted package-shaped proposal", () => {
    const result = createIntegrationProposal({
      identity: manifest.identity,
      integrationClass: manifest.integrationClass,
      capabilities: manifest.capabilities,
      upstreams: manifest.upstreams,
      operations: manifest.operations,
      permissions: manifest.permissions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("proposal");
    expect(result.value.files.map(({ path }) => path)).toEqual([
      "integration/manifest.json",
      "integration/support-matrix.json",
      "src/index.ts",
      "qualification/native-probe.ts",
      "README.md",
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(createIntegrationProposal({ ...manifest }).ok).toBe(true);
  });

  test("rejects unknown fields and live accessors at the hostile boundary", () => {
    expect(validateIntegrationManifest({ ...manifest, invented: true }).ok).toBe(false);
    const hostile = { ...manifest } as Record<string, unknown>;
    Object.defineProperty(hostile, "capabilities", {
      enumerable: true,
      get: () => ["runtime.agent"],
    });
    const result = validateIntegrationManifest(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("non-portable-value");
  });

  test("requires exact operation identities and one root closure subject", () => {
    const duplicate = { ...manifest, operations: [manifest.operations[0], manifest.operations[0]] };
    expect(validateIntegrationManifest(duplicate).ok).toBe(false);
    const wrongRoot = {
      rootArtifact: { ...acquisitionObservation.rootArtifact, id: "other" },
      executableClosure: acquisitionObservation.executableClosure,
    };
    expect(validateIntegrationArtifactBinding(wrongRoot).ok).toBe(false);
    const emptyClosure = {
      rootArtifact: acquisitionObservation.rootArtifact,
      executableClosure: {
        ...acquisitionObservation.executableClosure,
        representation: { kind: "members", members: [] },
      },
    };
    expect(validateIntegrationArtifactBinding(emptyClosure).ok).toBe(false);
    const duplicateClosure = {
      rootArtifact: acquisitionObservation.rootArtifact,
      executableClosure: {
        ...acquisitionObservation.executableClosure,
        representation: {
          kind: "members",
          members: [acquisitionObservation.rootArtifact, acquisitionObservation.rootArtifact],
        },
      },
    };
    expect(validateIntegrationArtifactBinding(duplicateClosure).ok).toBe(false);
  });
});
