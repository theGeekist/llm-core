import { createHash } from "node:crypto";
import {
  contractVersion,
  digest,
  extensionNamespace,
  isJsonValue,
  type JsonValue,
} from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  createSpecificationSourceSnapshot,
  type SpecificationDiagnostic,
  type SpecificationOperation,
  type SpecificationAdapterSupport,
} from "@geekist/llm-core/specifications";
import {
  AI_SDLC_API_VERSION,
  ATTESTATION_SCHEMA_ID,
  DECISION_SCHEMA_ID,
  parseAiSdlcDocument,
  type ParsedAiSdlcDocument,
} from "./schemas";

const FORMAT_ID = extensionNamespace("io.ai-sdlc.resource");
/** SemVer representation of the assessed v1alpha1 API contract. */
const FORMAT_VERSION = contractVersion("0.1.0-alpha.1");
const EXTENSION = "io.ai-sdlc.resource";
const ASSESSED_COMMIT = "11f2c83f17c797e85dcb65d6e1a9c17d02eb0335";
const DECISION_FIXTURE_DIGEST = digest(
  "e783a3b0eedc39a95ae61c9b67e088ca992fea2e7678a1e96e0cec78c0815054",
);
const ATTESTATION_FIXTURE_DIGEST = digest(
  "72e09f94393205609421b2781a8ccfbbd44da439a0662774bc8385cc3805e1da",
);
export interface AiSdlcImportInput {
  readonly sourceId: string;
  readonly revision: string;
  readonly observedAt: string;
  readonly documents: readonly JsonValue[];
}

export interface AiSdlcImportResult {
  /** Detached portable graph input for `loadSpecification`. */
  readonly graph: unknown;
  readonly operation: SpecificationOperation;
}

const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

/**
 * Canonical JSON for the pinned AI-SDLC schemas.
 *
 * The upstream schemas admit every finite JavaScript number that satisfies
 * their numeric constraints, including integers beyond Number.MAX_SAFE_INTEGER.
 * JSON.stringify provides the deterministic ECMAScript JSON representation of
 * such numbers; the ordering is supplied here for object members only.
 */
const canonicalizeAiSdlcJson = (value: JsonValue): string => {
  const serialize = (item: JsonValue): string => {
    if (item === null || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) {
        throw new TypeError("AI-SDLC canonical JSON does not support non-finite numbers.");
      }
      return JSON.stringify(item);
    }
    if (typeof item === "string") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(",")}]`;
    return `{${Object.keys(item)
      .sort(compareUtf16CodeUnits)
      .map((key) => `${JSON.stringify(key)}:${serialize(item[key]!)}`)
      .join(",")}}`;
  };

  if (!isJsonValue(value)) {
    throw new TypeError("AI-SDLC canonical JSON requires closed portable JSON data.");
  }
  return serialize(value);
};

const stableId = (parts: readonly string[]): string =>
  createHash("sha256")
    .update(canonicalizeAiSdlcJson([...parts]))
    .digest("hex");

const identityFor = (document: ParsedAiSdlcDocument): string =>
  document.type === "decision"
    ? document.decisionId
    : stableId(["AttestationEnvelopeV6", canonicalizeAiSdlcJson(document.document)]);

const documentIdFor = (document: ParsedAiSdlcDocument): string =>
  document.type === "decision"
    ? `Decision:${document.decisionId}`
    : `AttestationEnvelopeV6:${identityFor(document)}`;

const nodeIdFor = (sourceId: string, document: ParsedAiSdlcDocument): string =>
  `ai-sdlc.node.${stableId([sourceId, document.type, identityFor(document)])}`;

const governanceDiagnostic = (
  document: ParsedAiSdlcDocument,
  nodeId: string,
): SpecificationDiagnostic => ({
  code:
    document.type === "decision"
      ? "ai-sdlc.decision-governance-untrusted"
      : "ai-sdlc.attestation-unverified-source",
  severity: "warning",
  impact: "advisory",
  explanation:
    document.type === "decision"
      ? "The entire Decision document, including every identity, routing, lifecycle, answer, option, priority, and event-log field, remains unauthenticated source material; it does not mint llm-core authority."
      : "The entire attestation envelope, including every subject, reviewer, proof, count, nonce, time, hash, signer, and signature field, is preserved as unverified source evidence; this import performs no cryptographic verification.",
  nodeId: nodeId as never,
});

const parseDocuments = (documents: readonly JsonValue[]): readonly ParsedAiSdlcDocument[] => {
  if (documents.length === 0) throw new TypeError("AI-SDLC imports require supported documents.");
  const parsed = documents.map(parseAiSdlcDocument);
  const identities = parsed.map((document) => `${document.type}:${identityFor(document)}`);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError("AI-SDLC document identities must be unique by kind and native identity.");
  }
  return parsed;
};

export const isSupportedAiSdlcDocument = (value: JsonValue): boolean => {
  try {
    parseAiSdlcDocument(value);
    return true;
  } catch {
    return false;
  }
};

export const importAiSdlcDocuments = (rawInput: AiSdlcImportInput): AiSdlcImportResult => {
  if (
    !isJsonValue(rawInput) ||
    !isPortableRecord(rawInput) ||
    !hasOnlyKeys(rawInput, ["sourceId", "revision", "observedAt", "documents"])
  ) {
    throw new TypeError("AI-SDLC import input must be closed portable JSON data.");
  }
  const input = cloneFrozen(rawInput);
  if (
    typeof input.sourceId !== "string" ||
    typeof input.revision !== "string" ||
    typeof input.observedAt !== "string" ||
    !Array.isArray(input.documents) ||
    !input.sourceId.trim() ||
    !input.revision.trim()
  ) {
    throw new TypeError("AI-SDLC imports require source and revision identities.");
  }
  const documents = parseDocuments(input.documents);
  const sourceId = input.sourceId as never;
  const nodeIds = new Map(
    documents.map((document) => [
      `${document.type}:${identityFor(document)}`,
      nodeIdFor(input.sourceId, document),
    ]),
  );
  const diagnostics: SpecificationDiagnostic[] = documents.map((document) =>
    governanceDiagnostic(document, nodeIds.get(`${document.type}:${identityFor(document)}`)!),
  );
  const relationships: Record<string, JsonValue>[] = [];

  documents.forEach((document) => {
    if (document.type !== "decision") return;
    document.dependsOn.forEach((dependency, index) => {
      const target = nodeIds.get(`decision:${dependency}`);
      if (target === undefined) {
        throw new TypeError(
          `AI-SDLC portable derivation is unsupported because dependency '${dependency}' is outside this import.`,
        );
      }
      relationships.push({
        relationshipId: `ai-sdlc.relationship.${stableId([
          input.sourceId,
          document.decisionId,
          dependency,
          String(index),
        ])}`,
        kind: "depends-on",
        from: nodeIds.get(`decision:${document.decisionId}`)!,
        to: target,
        source: {
          sourceId,
          documentId: documentIdFor(document),
          location: `/spec/dependsOn/${index}`,
        },
      });
    });
  });

  const snapshot = createSpecificationSourceSnapshot({
    sourceId,
    format: { id: FORMAT_ID, version: FORMAT_VERSION },
    revision: input.revision,
    contentDigest: sha256(canonicalizeAiSdlcJson(input.documents)),
    observedAt: input.observedAt,
    role: "primary",
    authority: "advisory",
    documents: documents.map((document) => ({
      documentId: documentIdFor(document),
      content: document.document,
    })),
    extensions: {
      [EXTENSION]: {
        apiVersion: AI_SDLC_API_VERSION,
        assessedCommit: ASSESSED_COMMIT,
        schemas: [
          ...new Set(
            documents.map((document) =>
              document.type === "decision" ? DECISION_SCHEMA_ID : ATTESTATION_SCHEMA_ID,
            ),
          ),
        ],
      },
    },
  });
  const nodes = documents.map((document) => ({
    nodeId: nodeIds.get(`${document.type}:${identityFor(document)}`)!,
    kind: document.type === "decision" ? "decision" : "artifact",
    title:
      document.type === "decision"
        ? `${document.decisionId}: ${document.summary}`
        : `Attestation for ${document.subjectSha}`,
    source: { sourceId, documentId: documentIdFor(document) },
    content: document.document,
    extensions: {
      [EXTENSION]: {
        schema: document.type === "decision" ? DECISION_SCHEMA_ID : ATTESTATION_SCHEMA_ID,
        trust: "unverified-source",
      },
    },
  }));

  return cloneFrozen({
    operation: createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "AI-SDLC repository schemas",
        format: { id: FORMAT_ID, version: FORMAT_VERSION },
        revision: ASSESSED_COMMIT,
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "ai-sdlc.decision-v1.11f2c83", digest: DECISION_FIXTURE_DIGEST },
        { fixtureId: "ai-sdlc.attestation-v6.11f2c83", digest: ATTESTATION_FIXTURE_DIGEST },
      ],
      diagnostics,
    }),
    graph: {
      graphId: `ai-sdlc.graph.${stableId([input.sourceId, input.revision])}`,
      version: FORMAT_VERSION,
      sources: [snapshot],
      nodes,
      relationships,
    },
  });
};

export const AI_SDLC_ADAPTER_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: FORMAT_VERSION },
    authority: "AI-SDLC repository schemas",
    revision: ASSESSED_COMMIT,
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: {
          authority: "AI-SDLC repository schemas",
          format: { id: FORMAT_ID, version: FORMAT_VERSION },
          revision: ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "ai-sdlc.decision-v1.11f2c83", digest: DECISION_FIXTURE_DIGEST },
          { fixtureId: "ai-sdlc.attestation-v6.11f2c83", digest: ATTESTATION_FIXTURE_DIGEST },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: {
          authority: "AI-SDLC repository schemas",
          format: { id: FORMAT_ID, version: FORMAT_VERSION },
          revision: ASSESSED_COMMIT,
        },
        disposition: "supported",
        fixtures: [
          { fixtureId: "ai-sdlc.decision-v1.11f2c83", digest: DECISION_FIXTURE_DIGEST },
          { fixtureId: "ai-sdlc.attestation-v6.11f2c83", digest: ATTESTATION_FIXTURE_DIGEST },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: {
          authority: "AI-SDLC repository schemas",
          format: { id: FORMAT_ID, version: FORMAT_VERSION },
          revision: ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "AI-SDLC portable compilation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: {
          authority: "AI-SDLC repository schemas",
          format: { id: FORMAT_ID, version: FORMAT_VERSION },
          revision: ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "AI-SDLC native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: {
          authority: "AI-SDLC repository schemas",
          format: { id: FORMAT_ID, version: FORMAT_VERSION },
          revision: ASSESSED_COMMIT,
        },
        disposition: "unsupported",
        reason: "AI-SDLC native round trip is not implemented.",
        diagnostics: [],
      }),
    ],
  });

export { AI_SDLC_API_VERSION, ATTESTATION_SCHEMA_ID, DECISION_SCHEMA_ID } from "./schemas";
