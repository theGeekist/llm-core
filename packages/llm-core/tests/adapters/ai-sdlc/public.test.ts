import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { JsonObject, JsonValue } from "../../../src/contracts/public";
import {
  AI_SDLC_ADAPTER_SUPPORT,
  AI_SDLC_API_VERSION,
  ATTESTATION_SCHEMA_ID,
  DECISION_SCHEMA_ID,
  importAiSdlcDocuments,
  isSupportedAiSdlcDocument,
} from "../../../src/adapters/ai-sdlc/public";
import { loadSpecification } from "../../../src/specifications";

const fixtureText = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const fixture = (name: string): JsonObject => JSON.parse(fixtureText(name)) as JsonObject;

const fixtureDigest = (name: string): string =>
  createHash("sha256").update(fixtureText(name)).digest("hex");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schemaValidator = (name: string): ValidateFunction =>
  ajv.compile(fixture(name) as Parameters<Ajv2020["compile"]>[0]);
const validateDecision = schemaValidator("decision.v1.schema.json");
const validateAttestation = schemaValidator("attestation-envelope-v6.schema.json");

const importFixtures = (documents: readonly JsonValue[]) =>
  importAiSdlcDocuments({
    sourceId: "ai-sdlc:fixtures",
    revision: "11f2c83f17c797e85dcb65d6e1a9c17d02eb0335",
    observedAt: "2026-08-02T00:00:00.000Z",
    documents,
  });

const graphIdentityAndDigestFor = (document: JsonObject) =>
  importFixtures([document]).graph as {
    readonly nodes: readonly {
      readonly nodeId: string;
      readonly source: { readonly documentId: string };
    }[];
    readonly sources: readonly { readonly contentDigest: unknown }[];
  };

const dependencyDecision = (): JsonObject => {
  const decision = fixture("decision-v1.json");
  return {
    ...decision,
    metadata: {
      ...(decision.metadata as JsonObject),
      id: "DEC-1000",
    },
    spec: {
      ...(decision.spec as JsonObject),
      summary: "Choose the prerequisite authentication posture",
      dependsOn: [],
    },
  };
};

const reverseTopLevelProperties = (document: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(document).reverse()) as JsonObject;

const reversePropertiesRecursively = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(reversePropertiesRecursively);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .reverse()
      .map(([key, child]) => [key, reversePropertiesRecursively(child)]),
  ) as JsonObject;
};

describe("AI-SDLC v1alpha1 resource adapter", () => {
  test("imports the pinned Decision v1 fixture and maps its real dependsOn edge", () => {
    const imported = importFixtures([dependencyDecision(), fixture("decision-v1.json")]);
    const graph = imported.graph as {
      readonly nodes: readonly {
        readonly nodeId: string;
        readonly source: { readonly documentId: string };
      }[];
      readonly relationships: readonly {
        readonly kind: string;
        readonly from: string;
        readonly to: string;
        readonly source: { readonly documentId: string; readonly location?: string };
      }[];
    };
    const prerequisite = graph.nodes.find(
      (node) => node.source.documentId === "Decision:DEC-1000",
    )!;
    const decision = graph.nodes.find((node) => node.source.documentId === "Decision:DEC-1001")!;

    expect(graph.relationships).toEqual([
      expect.objectContaining({
        kind: "depends-on",
        from: decision.nodeId,
        to: prerequisite.nodeId,
        source: expect.objectContaining({
          documentId: "Decision:DEC-1001",
          location: "/spec/dependsOn/0",
        }),
      }),
    ]);
  });

  test("retains Decision governance claims as unauthenticated source material", () => {
    const imported = importFixtures([dependencyDecision(), fixture("decision-v1.json")]);
    const graph = imported.graph as {
      readonly sources: readonly { readonly authority: string }[];
      readonly nodes: readonly {
        readonly kind: string;
        readonly source: { readonly documentId: string };
        readonly extensions: Record<string, { readonly trust: string }>;
      }[];
    };

    expect(graph.sources[0]).toMatchObject({ authority: "advisory" });
    expect(
      graph.nodes.find((node) => node.source.documentId === "Decision:DEC-1001"),
    ).toMatchObject({
      kind: "decision",
      source: { documentId: "Decision:DEC-1001" },
      extensions: { "io.ai-sdlc.resource": { trust: "unverified-source" } },
    });
    expect(imported.operation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ai-sdlc.decision-governance-untrusted",
        impact: "advisory",
      }),
    );
    expect(graph).not.toHaveProperty("decisionRecord");
  });

  test("imports the pinned AttestationEnvelopeV6 fixture without treating its signer as trusted", () => {
    const imported = importFixtures([fixture("attestation-envelope-v6.json")]);
    const graph = imported.graph as {
      readonly nodes: readonly {
        readonly nodeId: string;
        readonly kind: string;
        readonly source: { readonly documentId: string };
        readonly extensions: Record<string, { readonly schema: string; readonly trust: string }>;
      }[];
    };

    expect(graph.nodes[0]).toMatchObject({
      kind: "artifact",
      source: {
        documentId: expect.stringMatching(/^AttestationEnvelopeV6:[0-9a-f]{64}$/),
      },
      extensions: {
        "io.ai-sdlc.resource": {
          schema: ATTESTATION_SCHEMA_ID,
          trust: "unverified-source",
        },
      },
    });
    expect(imported.operation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ai-sdlc.attestation-unverified-source",
        impact: "advisory",
      }),
    );
  });

  test("uses stable, kind-specific native document identities", () => {
    const documents = [
      dependencyDecision(),
      fixture("decision-v1.json"),
      fixture("attestation-envelope-v6.json"),
    ];
    const first = importFixtures(documents).graph as {
      readonly nodes: readonly {
        readonly nodeId: string;
        readonly source: { readonly documentId: string };
      }[];
    };
    const second = importFixtures(documents).graph as {
      readonly nodes: readonly {
        readonly nodeId: string;
        readonly source: { readonly documentId: string };
      }[];
    };

    expect(first.nodes).toEqual(second.nodes);
    expect(first.nodes.some((node) => node.source.documentId === "Decision:DEC-1001")).toBe(true);
    expect(
      first.nodes.find((node) => node.source.documentId.startsWith("AttestationEnvelopeV6:"))
        ?.source.documentId,
    ).toMatch(/^AttestationEnvelopeV6:[0-9a-f]{64}$/);
    expect(new Set(first.nodes.map((node) => node.nodeId)).size).toBe(3);
  });

  test("accepts schema-valid non-safe leaf counts while canonicalizing property order", () => {
    const envelope = fixture("attestation-envelope-v6.json");
    envelope.leafCount = 9007199254740992;
    const topLevelReordered = reverseTopLevelProperties(envelope);
    const nestedReordered = reversePropertiesRecursively(envelope) as JsonObject;

    const original = graphIdentityAndDigestFor(envelope);
    const topLevel = graphIdentityAndDigestFor(topLevelReordered);
    const nested = graphIdentityAndDigestFor(nestedReordered);

    expect(validateAttestation(envelope), JSON.stringify(validateAttestation.errors)).toBe(true);
    expect(isSupportedAiSdlcDocument(envelope)).toBe(true);
    expect(original.nodes[0]!.source.documentId).toMatch(/^AttestationEnvelopeV6:[0-9a-f]{64}$/);
    expect(topLevel.nodes).toEqual(original.nodes);
    expect(nested.nodes).toEqual(original.nodes);
    expect(topLevel.sources[0]!.contentDigest).toEqual(original.sources[0]!.contentDigest);
    expect(nested.sources[0]!.contentDigest).toEqual(original.sources[0]!.contentDigest);
  });

  test("keeps AttestationEnvelopeV6 array order meaningful for identities and source digests", () => {
    const envelope = fixture("attestation-envelope-v6.json");
    envelope.transcriptLeaves = [
      {
        leafIndex: 0,
        reviewerName: "security-reviewer",
        transcriptHash: "2222222222222222222222222222222222222222222222222222222222222222",
      },
      {
        leafIndex: 1,
        reviewerName: "test-reviewer",
        transcriptHash: "3333333333333333333333333333333333333333333333333333333333333333",
      },
    ];
    envelope.merkleProofs = [
      { leafIndex: 0, proof: [] },
      { leafIndex: 1, proof: ["4444444444444444444444444444444444444444444444444444444444444444"] },
    ];
    const reordered = structuredClone(envelope);
    reordered.transcriptLeaves = [...(reordered.transcriptLeaves as JsonValue[])].reverse();
    reordered.merkleProofs = [...(reordered.merkleProofs as JsonValue[])].reverse();

    expect(validateAttestation(envelope), JSON.stringify(validateAttestation.errors)).toBe(true);
    expect(validateAttestation(reordered), JSON.stringify(validateAttestation.errors)).toBe(true);
    const original = graphIdentityAndDigestFor(envelope);
    const reversed = graphIdentityAndDigestFor(reordered);

    expect(reversed.nodes).not.toEqual(original.nodes);
    expect(reversed.sources[0]!.contentDigest).not.toEqual(original.sources[0]!.contentDigest);
  });

  test("does not guess that an attested subject is the envelope identity", () => {
    const firstEnvelope = fixture("attestation-envelope-v6.json");
    const secondEnvelope = structuredClone(firstEnvelope);
    secondEnvelope.nonce = "5555555555555555555555555555555555555555555555555555555555555555";
    const imported = importFixtures([firstEnvelope, secondEnvelope]);
    const graph = imported.graph as {
      readonly nodes: readonly {
        readonly nodeId: string;
        readonly source: { documentId: string };
      }[];
    };

    expect(graph.nodes).toHaveLength(2);
    expect(new Set(graph.nodes.map((node) => node.nodeId)).size).toBe(2);
    expect(new Set(graph.nodes.map((node) => node.source.documentId)).size).toBe(2);
    expect(() => loadSpecification(imported.graph)).not.toThrow();
  });

  test("preserves duplicate dependsOn occurrences without colliding relationship identities", () => {
    const decision = fixture("decision-v1.json");
    (decision.spec as JsonObject).dependsOn = ["DEC-1000", "DEC-1000"];
    const imported = importFixtures([dependencyDecision(), decision]);
    const graph = imported.graph as {
      readonly relationships: readonly { readonly relationshipId: string }[];
    };

    expect(graph.relationships).toHaveLength(2);
    expect(new Set(graph.relationships.map(({ relationshipId }) => relationshipId)).size).toBe(2);
    expect(() => loadSpecification(imported.graph)).not.toThrow();
  });

  test("accepts exactly the assessed schema inventory", () => {
    expect(isSupportedAiSdlcDocument(fixture("decision-v1.json"))).toBe(true);
    expect(isSupportedAiSdlcDocument(fixture("attestation-envelope-v6.json"))).toBe(true);
    expect(
      isSupportedAiSdlcDocument({ apiVersion: AI_SDLC_API_VERSION, kind: "Requirement" }),
    ).toBe(false);
    expect(isSupportedAiSdlcDocument({ schemaVersion: "v5" })).toBe(false);
  });

  test("matches the pinned Draft 2020-12 schemas rather than imposing inferred semantics", () => {
    const decision = structuredClone(fixture("decision-v1.json"));
    const metadata = decision.metadata as JsonObject;
    const spec = decision.spec as JsonObject;
    metadata.scope = "";
    metadata.created = "2026-08-01T08:00:00+08:00";
    metadata.updated = "2026-08-01 08:00:00+0800";
    spec.summary = " ";
    ((spec.options as JsonValue[])[0] as JsonObject).description = " ";
    spec.options = [
      ...(spec.options as JsonValue[]),
      structuredClone((spec.options as JsonValue[])[0]!),
    ];
    spec.dependsOn = ["", "not-a-decision-id", "not-a-decision-id"];
    spec.timebox = "";
    spec.autonomousFallbackOptionId = "undeclared-option";
    spec.contextRef = "";

    const attestation = structuredClone(fixture("attestation-envelope-v6.json"));
    attestation.signerIdentity = "";
    attestation.rootSignature = " ";
    ((attestation.transcriptLeaves as JsonValue[])[0] as JsonObject).reviewerName = " ";
    attestation.transcriptLeaves = [
      ...(attestation.transcriptLeaves as JsonValue[]),
      structuredClone((attestation.transcriptLeaves as JsonValue[])[0]!),
    ];
    attestation.merkleProofs = [{ leafIndex: 99, proof: [] }];

    expect(validateDecision(decision), JSON.stringify(validateDecision.errors)).toBe(true);
    expect(validateAttestation(attestation), JSON.stringify(validateAttestation.errors)).toBe(true);
    expect(isSupportedAiSdlcDocument(decision)).toBe(true);
    expect(isSupportedAiSdlcDocument(attestation)).toBe(true);

    const invalidEventDecision = structuredClone(fixture("decision-v1.json"));
    invalidEventDecision.decisionLog = [
      {
        eventVersion: "v1",
        type: "decision-opened",
        ts: "2026-08-01T00:00:00Z",
        decisionId: "DEC-1001",
        by: 1,
      },
    ];
    expect(validateDecision(invalidEventDecision)).toBe(false);
    expect(isSupportedAiSdlcDocument(invalidEventDecision)).toBe(false);
  });

  test("returns an immutable detached graph that loadSpecification accepts", () => {
    const sourceDecision = fixture("decision-v1.json");
    const imported = importFixtures([dependencyDecision(), sourceDecision]);
    const graph = imported.graph as {
      readonly nodes: readonly { readonly content: JsonObject }[];
    };

    expect(() => loadSpecification(imported.graph)).not.toThrow();
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(imported.operation)).toBe(true);
    expect(Object.isFrozen(imported.graph)).toBe(true);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.nodes[0]!.content)).toBe(true);

    (sourceDecision.metadata as JsonObject).id = "DEC-9999";
    const capturedDecision = graph.nodes.find(
      (node) => (node.content.metadata as JsonObject).id === "DEC-1001",
    );
    expect((capturedDecision?.content.metadata as JsonObject).id).toBe("DEC-1001");
  });

  test("rejects hostile or non-portable input without invoking accessors", () => {
    let getterCalls = 0;
    const accessor = fixture("decision-v1.json") as Record<string, unknown>;
    Object.defineProperty(accessor, "kind", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "Decision";
      },
    });
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const proxied = new Proxy(fixture("decision-v1.json"), {});

    expect(isSupportedAiSdlcDocument(accessor as JsonValue)).toBe(false);
    expect(getterCalls).toBe(0);
    expect(isSupportedAiSdlcDocument(cyclic as JsonValue)).toBe(false);
    expect(isSupportedAiSdlcDocument(proxied as JsonValue)).toBe(false);
    expect(() => importAiSdlcDocuments(proxied as never)).toThrow(TypeError);
  });

  test("pins fixture bytes and upstream schema evidence reproducibly", () => {
    expect(validateDecision(fixture("decision-v1.json"))).toBe(true);
    expect(validateAttestation(fixture("attestation-envelope-v6.json"))).toBe(true);
    expect(fixtureDigest("decision.v1.schema.json")).toBe(
      "4c5605f2f199fc90ed4b7e211edef6352dce429d3dba84bc03c3d6afdd466d37",
    );
    expect(fixtureDigest("attestation-envelope-v6.schema.json")).toBe(
      "7ff57106ea497ffd04516a867e2855169a69c8a97df76c01ffe1a4861b0cfff4",
    );
    const derivation = AI_SDLC_ADAPTER_SUPPORT.operations.find(
      (operation) => operation.operation === "derive-portable-specification",
    );
    if (derivation?.disposition !== "supported")
      throw new TypeError("Expected derivation support.");
    expect(derivation.fixtures).toEqual([
      {
        fixtureId: "ai-sdlc.decision-v1.11f2c83",
        digest: expect.objectContaining({
          algorithm: "sha-256",
          value: fixtureDigest("decision-v1.json"),
        }),
      },
      {
        fixtureId: "ai-sdlc.attestation-v6.11f2c83",
        digest: expect.objectContaining({
          algorithm: "sha-256",
          value: fixtureDigest("attestation-envelope-v6.json"),
        }),
      },
    ]);
    expect(AI_SDLC_ADAPTER_SUPPORT).toMatchObject({
      authority: "AI-SDLC repository schemas",
      revision: "11f2c83f17c797e85dcb65d6e1a9c17d02eb0335",
    });
    expect(DECISION_SCHEMA_ID).toBe("https://ai-sdlc.io/schemas/v1alpha1/decision.v1.schema.json");
  });
});
