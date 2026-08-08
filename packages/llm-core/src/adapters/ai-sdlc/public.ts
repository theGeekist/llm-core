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
  createConversionReport,
  createSpecificationAdapterSupport,
  createSpecificationSourceSnapshot,
  type ConversionIssue,
  type ConversionReport,
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
const DECISION_SCHEMA_DIGEST = digest(
  "4c5605f2f199fc90ed4b7e211edef6352dce429d3dba84bc03c3d6afdd466d37",
);
const ATTESTATION_SCHEMA_DIGEST = digest(
  "7ff57106ea497ffd04516a867e2855169a69c8a97df76c01ffe1a4861b0cfff4",
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
  readonly report: ConversionReport;
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

const governanceIssue = (document: ParsedAiSdlcDocument, nodeId: string): ConversionIssue => ({
  code:
    document.type === "decision"
      ? "ai-sdlc.decision-governance-untrusted"
      : "ai-sdlc.attestation-unverified-source",
  severity: "warning",
  disposition: "degraded",
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
  const issues: ConversionIssue[] = documents.map((document) =>
    governanceIssue(document, nodeIds.get(`${document.type}:${identityFor(document)}`)!),
  );
  const relationships: Record<string, JsonValue>[] = [];

  documents.forEach((document) => {
    if (document.type !== "decision") return;
    document.dependsOn.forEach((dependency, index) => {
      const target = nodeIds.get(`decision:${dependency}`);
      if (target === undefined) {
        issues.push({
          code: "ai-sdlc.decision-dependency-unresolved",
          severity: "warning",
          disposition: "degraded",
          explanation: `Decision dependency '${dependency}' is outside this import; no relationship meaning was guessed.`,
          source: {
            sourceId,
            documentId: documentIdFor(document),
            location: `/spec/dependsOn/${index}`,
          },
        });
        return;
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

  const report = createConversionReport({ fidelity: "partial", issues });
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
    report,
    graph: {
      graphId: `ai-sdlc.graph.${stableId([input.sourceId, input.revision])}`,
      version: FORMAT_VERSION,
      sources: [snapshot],
      nodes,
      relationships,
      report,
    },
  });
};

export const AI_SDLC_ADAPTER_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: FORMAT_VERSION },
    direction: "import",
    supportedVersions: [FORMAT_VERSION],
    levels: ["syntax", "semantic"],
    features: [
      "apiVersion-ai-sdlc.io-v1alpha1",
      "decision-v1-draft-2020-12",
      "decision-dependsOn-relationships",
      "attestation-envelope-v6-draft-2020-12",
      "governance-claims-as-untrusted-source",
    ],
    preservedExtensionNamespaces: [FORMAT_ID],
    sourceOwnership: "source-owned",
    writeBack: "unsupported",
    fixtures: [
      { fixtureId: "ai-sdlc.decision-v1.11f2c83", digest: DECISION_FIXTURE_DIGEST },
      { fixtureId: "ai-sdlc.attestation-v6.11f2c83", digest: ATTESTATION_FIXTURE_DIGEST },
    ],
    evidence: [
      { evidenceId: "ai-sdlc.schema.decision-v1.11f2c83", digest: DECISION_SCHEMA_DIGEST },
      {
        evidenceId: "ai-sdlc.schema.attestation-v6.11f2c83",
        digest: ATTESTATION_SCHEMA_DIGEST,
      },
    ],
  });

export { AI_SDLC_API_VERSION, ATTESTATION_SCHEMA_ID, DECISION_SCHEMA_ID } from "./schemas";
