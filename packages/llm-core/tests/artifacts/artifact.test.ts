import { describe, expect, test } from "bun:test";
import {
  digest,
  newCoreId,
  type InvocationId,
  type ResourceId,
  type RunId,
  type StepId,
} from "#contracts";
import {
  createArtifact,
  createArtifactRef,
  type ArtifactInput,
} from "../../src/features/artifacts/public";

const resource = {
  resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002110"),
  mediaType: "application/json",
  byteLength: 42,
  digest: digest("a".repeat(64)),
};
const invocationId = newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002111");
const runId = newCoreId<RunId>("0190bd0c-0000-7000-8000-000000002112");
const stepId = newCoreId<StepId>("0190bd0c-0000-7000-8000-000000002113");

describe("Artifact", () => {
  test("uses ResourceRef UUID identity and digest integrity without physical locators", () => {
    const ref = createArtifactRef(resource);

    expect(ref).toEqual({ kind: "artifact", resource });
    expect(ref.resource.resourceId).toBe(resource.resourceId);
    expect(ref.resource.digest).toEqual(resource.digest);
    expect("path" in ref.resource).toBe(false);
    expect("url" in ref.resource).toBe(false);
    expect(Object.isFrozen(ref.resource)).toBe(true);
  });

  test("constructs deterministic references and portable generated provenance", () => {
    const artifactInput: ArtifactInput = {
      content: resource,
      provenance: { kind: "generated", invocationId, runId, stepId },
      metadata: { format: "report", revision: 1 },
    };
    const first = createArtifact(artifactInput);
    const second = createArtifact(structuredClone(artifactInput));

    expect(second).toEqual(first);
    expect(first.ref.resource.resourceId).toBe(resource.resourceId);
    expect(first.provenance).toEqual({ kind: "generated", invocationId, runId, stepId });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.metadata)).toBe(true);
  });

  test("clones inputs and retains immutable artifact identity after caller mutation", () => {
    const mutable = {
      ...resource,
      digest: { ...resource.digest },
    };
    const artifact = createArtifact({
      content: mutable,
      provenance: { kind: "supplied" },
      metadata: { name: "before" },
    });
    mutable.byteLength = 999;
    mutable.digest.value = "b".repeat(64);

    expect(artifact.ref.resource.byteLength).toBe(42);
    expect(artifact.ref.resource.digest.value).toBe("a".repeat(64));
  });

  test("rejects locators, secret-bearing extensions, and native metadata", () => {
    expect(() => createArtifactRef({ ...resource, path: "/private/artifact" } as never)).toThrow(
      "ResourceRef",
    );
    expect(() =>
      createArtifact({
        content: resource,
        provenance: { kind: "supplied", secret: "sk-private" },
      } as never),
    ).toThrow("provenance");
    expect(() =>
      createArtifact({
        content: resource,
        provenance: { kind: "supplied" },
        metadata: { createdAt: new Date() },
      } as never),
    ).toThrow("portable");
  });

  test("rejects malformed resource integrity and schema references", () => {
    expect(() => createArtifactRef({ ...resource, byteLength: -1 } as never)).toThrow(
      "ResourceRef",
    );
    expect(() =>
      createArtifactRef({ ...resource, digest: { algorithm: "sha-256", value: "A".repeat(64) } }),
    ).toThrow("ResourceRef");
    expect(() =>
      createArtifactRef(resource, {
        schema: {
          schemaId: "/relative",
          version: "1.0.0",
          digest: digest("c".repeat(64)),
        } as never,
      }),
    ).toThrow("SchemaRef");
  });

  test("rejects accessor-backed and hidden nested contract fields without invoking them", () => {
    let reads = 0;
    const accessorDigest = { algorithm: "sha-256" } as Record<string, unknown>;
    Object.defineProperty(accessorDigest, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "a".repeat(64);
      },
    });

    expect(() => createArtifactRef({ ...resource, digest: accessorDigest } as never)).toThrow(
      "ResourceRef",
    );
    expect(reads).toBe(0);

    const hiddenDigest = { ...resource.digest };
    Object.defineProperty(hiddenDigest, "secret", {
      enumerable: false,
      value: "must-not-be-silently-dropped",
    });
    expect(() => createArtifactRef({ ...resource, digest: hiddenDigest } as never)).toThrow(
      "ResourceRef",
    );
  });

  test("requires coherent generated and derived provenance", () => {
    expect(() =>
      createArtifact({
        content: resource,
        provenance: { kind: "generated", invocationId, stepId },
      } as never),
    ).toThrow("provenance");
    expect(() =>
      createArtifact({
        content: resource,
        provenance: { kind: "derived", operation: "merge", sources: [] },
      }),
    ).toThrow("provenance");

    const source = createArtifactRef(resource);
    expect(() =>
      createArtifact({
        content: resource,
        provenance: { kind: "derived", operation: "merge", sources: [source, source] },
      }),
    ).toThrow("duplicate");
    const conflictingClaim = createArtifactRef({
      ...resource,
      digest: digest("b".repeat(64)),
    });
    expect(() =>
      createArtifact({
        content: resource,
        provenance: {
          kind: "derived",
          operation: "merge",
          sources: [source, conflictingClaim],
        },
      }),
    ).toThrow("duplicate");
    expect(
      createArtifact({
        content: {
          ...resource,
          resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002114"),
        },
        provenance: { kind: "derived", operation: "merge", sources: [source] },
      }).provenance,
    ).toEqual({ kind: "derived", operation: "merge", sources: [source] });
  });
});
