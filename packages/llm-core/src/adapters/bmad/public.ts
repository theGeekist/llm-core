import { createHash } from "node:crypto";
import { contractVersion, digest, extensionNamespace, type JsonValue } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  createSpecificationSourceSnapshot,
  type SpecificationDiagnostic,
  type SpecificationAdapterSupport,
  type SpecificationFormat,
  type SpecificationSourceSnapshot,
} from "@aifsd/llm-core/specifications";
import {
  assertFileInput,
  assertTimestamp,
  capturePortable,
  devAutoArtifactRoleFor,
  kindFor,
  nodeKindFor,
  parseDevAutoOutcome,
  parseMemlog,
  stableArtifacts,
  titleFor,
  unparsedConventionFor,
} from "./parsing";
import type {
  BmadCliObservation,
  BmadCliObservationInput,
  BmadFileImportInput,
  BmadImportedSpecification,
  BmadParsedOutcome,
} from "./types";

export type {
  BmadArtifact,
  BmadArtifactKind,
  BmadCliObservation,
  BmadCliObservationInput,
  BmadDevAutoStatus,
  BmadFileImportInput,
  BmadImportedSpecification,
  BmadParsedOutcome,
} from "./types";

export const BMAD_ASSESSED_VERSION = contractVersion("6.10.0");
export const BMAD_ASSESSED_CLI_VERSION = "6.10.0" as const;

const EXTENSION = extensionNamespace("io.github.bmad-code-org");

export const BMAD_FILE_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.bmad-code-org.file"),
  version: BMAD_ASSESSED_VERSION,
});

export const BMAD_CLI_FORMAT: SpecificationFormat = Object.freeze({
  id: extensionNamespace("io.github.bmad-code-org.cli"),
  version: BMAD_ASSESSED_VERSION,
});

const MEMLOG_FIXTURE_DIGEST = digest(
  "edadb2a9c80c95256e9b2d396c08f0e52c72b608de8aa066fa01271a00a7d4af",
);
const DEV_AUTO_FIXTURE_DIGEST = digest(
  "b1440f9bfde8a3226b553942a3032ec8f4f163d15ac5e30e26473dc7635558cc",
);
const CLI_VERSION_FIXTURE_DIGEST = digest(
  "81254ec8251acd235eecc3375f5dc6931a9fd2c4405b0c2e2760aaa7b960307b",
);

const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

const sourceContentDigest = (artifacts: BmadFileImportInput["artifacts"]) =>
  sha256(JSON.stringify(artifacts.map(({ path, content }) => [path, content])));

/** Pinned semantic support: flat memlogs and Dev Auto lifecycle results. */
export const BMAD_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport({
  format: BMAD_FILE_FORMAT,
  authority: "BMAD Method repository",
  revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
  sourceOwnership: "source-owned",
  operations: [
    createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "bmad.file.memlog.v6.10.0", digest: MEMLOG_FIXTURE_DIGEST },
        { fixtureId: "bmad.file.dev-auto-blocked.v6.10.0", digest: DEV_AUTO_FIXTURE_DIGEST },
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "bmad.file.memlog.v6.10.0", digest: MEMLOG_FIXTURE_DIGEST },
        { fixtureId: "bmad.file.dev-auto-blocked.v6.10.0", digest: DEV_AUTO_FIXTURE_DIGEST },
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "compile-portable-specification",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD portable compilation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "export-native-source",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD native export is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "round-trip-native-source",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD native round trip is not implemented.",
      diagnostics: [],
    }),
  ],
});

/** `bmad --version` is the only qualified 6.10.0 CLI invocation. */
export const BMAD_CLI_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport({
  format: BMAD_CLI_FORMAT,
  authority: "BMAD Method CLI",
  revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
  sourceOwnership: "source-owned",
  operations: [
    createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: {
        authority: "BMAD Method CLI",
        format: BMAD_CLI_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "bmad.cli.version-stdout.v6.10.0", digest: CLI_VERSION_FIXTURE_DIGEST },
      ],
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "BMAD Method CLI",
        format: BMAD_CLI_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD CLI portable derivation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "compile-portable-specification",
      sourceContract: {
        authority: "BMAD Method CLI",
        format: BMAD_CLI_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD CLI portable compilation is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "export-native-source",
      sourceContract: {
        authority: "BMAD Method CLI",
        format: BMAD_CLI_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD CLI native export is not implemented.",
      diagnostics: [],
    }),
    createSpecificationOperation({
      operation: "round-trip-native-source",
      sourceContract: {
        authority: "BMAD Method CLI",
        format: BMAD_CLI_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "unsupported",
      reason: "BMAD CLI native round trip is not implemented.",
      diagnostics: [],
    }),
  ],
});

const stableIdentity = (kind: "artifact" | "memlog-record", parts: readonly JsonValue[]): string =>
  `bmad.${kind}.${createHash("sha256")
    .update(JSON.stringify([kind, ...parts]))
    .digest("hex")}`;

const outcomeAsJson = (outcome: BmadParsedOutcome): JsonValue => ({ ...outcome });

const classify = (artifacts: BmadFileImportInput["artifacts"]) =>
  artifacts.map((artifact) => ({ artifact, kind: kindFor(artifact) }));

type ClassifiedArtifact = ReturnType<typeof classify>[number];

interface ParsedImport {
  readonly input: BmadFileImportInput;
  readonly artifacts: BmadFileImportInput["artifacts"];
  readonly classified: readonly ClassifiedArtifact[];
  readonly memlogs: readonly ReturnType<typeof parseMemlog>[];
  readonly outcomes: readonly BmadParsedOutcome[];
  readonly unparsed: readonly { readonly path: string; readonly convention: string }[];
}

const sourceSnapshot = ({
  input,
  artifacts,
  classified,
  memlogs,
  outcomes,
  unparsed,
}: ParsedImport): SpecificationSourceSnapshot =>
  createSpecificationSourceSnapshot({
    sourceId: input.sourceId as never,
    format: BMAD_FILE_FORMAT,
    revision: input.revision,
    contentDigest: sourceContentDigest(artifacts),
    observedAt: input.observedAt,
    role: "primary",
    authority: "authoritative",
    documents: artifacts.map((artifact) => ({
      documentId: artifact.path,
      content: { path: artifact.path, text: artifact.content },
    })),
    extensions: {
      [EXTENSION]: {
        artifacts: classified.map(({ artifact, kind }) => ({ path: artifact.path, kind })),
        memlogs: memlogs.map((memlog) => ({
          path: memlog.path,
          frontmatter: memlog.frontmatter,
          records: memlog.records.map((record) => ({
            bodyOrdinal: record.bodyOrdinal,
            raw: record.raw,
            text: record.text,
            ...(record.type === undefined ? {} : { type: record.type }),
            ...(record.by === undefined ? {} : { by: record.by }),
          })),
        })),
        outcomes: outcomes.map(outcomeAsJson),
        unparsedConventions: unparsed.map(({ path, convention }) => ({
          path,
          convention,
        })),
      },
    },
  });

const artifactNodes = (input: BmadFileImportInput, classified: readonly ClassifiedArtifact[]) =>
  classified.map(({ artifact, kind }) => ({
    nodeId: stableIdentity("artifact", [input.sourceId, artifact.path]),
    kind: nodeKindFor(kind),
    title: titleFor(artifact),
    source: { sourceId: input.sourceId as never, documentId: artifact.path },
    content: { path: artifact.path, text: artifact.content },
  }));

const memoryNode = (
  input: BmadFileImportInput,
  record: ReturnType<typeof parseMemlog>["records"][number],
) => {
  const contentDigest = sha256(record.raw).value;
  return {
    nodeId: stableIdentity("memlog-record", [
      input.sourceId,
      record.path,
      record.bodyOrdinal,
      contentDigest,
    ]),
    kind:
      record.type === "decision"
        ? "decision"
        : record.type === "question"
          ? "question"
          : "artifact",
    title: record.type === undefined ? "BMAD memory record" : `BMAD memory: ${record.type}`,
    source: {
      sourceId: input.sourceId as never,
      documentId: record.path,
      location: `body entry ${record.bodyOrdinal}`,
    },
    content: {
      path: record.path,
      bodyOrdinal: record.bodyOrdinal,
      text: record.text,
      raw: record.raw,
      ...(record.type === undefined ? {} : { type: record.type }),
      ...(record.by === undefined ? {} : { by: record.by }),
    },
    extensions: {
      [EXTENSION]: {
        appendOnly: true,
        recordIdentity: { bodyOrdinal: record.bodyOrdinal, contentDigest },
      },
    },
  };
};

const derivationDiagnostics = ({
  input,
  memlogs,
  outcomes,
  unparsed,
}: ParsedImport): SpecificationDiagnostic[] => {
  const sourceId = input.sourceId as never;
  return [
    {
      code: "bmad-source-owned-artifacts",
      severity: "info",
      impact: "advisory",
      explanation:
        "BMAD artifact bytes and lifecycle state remain source-owned; this detached import grants no write-back or execution authority.",
      source: { sourceId, documentId: input.artifacts[0]!.path },
    },
    ...memlogs.map((memlog) => ({
      code: "bmad-append-only-memory-preserved",
      severity: "info" as const,
      impact: "advisory" as const,
      explanation:
        "BMAD memlog body entries are retained as append-only evidence with body-relative identities, not mutable node metadata.",
      source: { sourceId, documentId: memlog.path },
    })),
    ...outcomes
      .filter((outcome) => outcome.status === "blocked")
      .map((outcome) => ({
        code: "bmad-blocked-outcome-preserved",
        severity: "warning" as const,
        impact: "advisory" as const,
        explanation:
          "BMAD blocked is a parsed source workflow outcome, not successful completion or llm-core rejection.",
        source: { sourceId, documentId: outcome.artifactPath },
      })),
    ...unparsed.map(({ path, convention }) => ({
      code: "bmad-unparsed-convention-preserved",
      severity: "warning" as const,
      impact: "advisory" as const,
      explanation: `${convention} are byte-preserved but deliberately not interpreted by the BMAD 6.10.0 adapter. This is a partial observation, not a source terminal status.`,
      source: { sourceId, documentId: path },
    })),
  ];
};

/** Parses pinned memlog and Dev Auto shapes and names every other semantic loss. */
export const importBmadFiles = (rawInput: BmadFileImportInput): BmadImportedSpecification => {
  const input = capturePortable(rawInput, "BMAD file import input");
  assertFileInput(input, BMAD_ASSESSED_VERSION);
  const artifacts = stableArtifacts(input.artifacts);
  const classified = classify(artifacts);
  const memlogs = classified
    .filter(({ kind }) => kind === "memlog")
    .map(({ artifact }) => parseMemlog(artifact));
  const outcomes = classified.flatMap(({ artifact }) => {
    const role = devAutoArtifactRoleFor(artifact);
    return role === undefined ? [] : [parseDevAutoOutcome(artifact, role)];
  });
  const unparsed = classified.map(({ artifact, kind }) => ({
    path: artifact.path,
    convention: unparsedConventionFor(kind),
  }));
  const parsed = { input, artifacts, classified, memlogs, outcomes, unparsed };
  const source = sourceSnapshot(parsed);
  const diagnostics = derivationDiagnostics(parsed);
  return cloneFrozen({
    graph: {
      graphId: stableIdentity("artifact", [input.sourceId, "graph", input.revision]),
      version: BMAD_ASSESSED_VERSION,
      sources: [source],
      nodes: [
        ...artifactNodes(input, classified),
        ...memlogs.flatMap((memlog) => memlog.records.map((record) => memoryNode(input, record))),
      ],
      relationships: [],
    },
    operation: createSpecificationOperation({
      operation: "derive-portable-specification",
      sourceContract: {
        authority: "BMAD Method repository",
        format: BMAD_FILE_FORMAT,
        revision: "bb45db4aa4496c69239f9c0629c290fd1b072fc9",
      },
      disposition: "supported",
      fixtures: [
        { fixtureId: "bmad.file.memlog.v6.10.0", digest: MEMLOG_FIXTURE_DIGEST },
        { fixtureId: "bmad.file.dev-auto-blocked.v6.10.0", digest: DEV_AUTO_FIXTURE_DIGEST },
      ],
      diagnostics,
    }),
    support: [BMAD_FILE_SUPPORT, BMAD_CLI_SUPPORT],
  }) as BmadImportedSpecification;
};

/** Captures the exact successful `bmad --version` observation. */
export const observeBmadCli = (rawInput: BmadCliObservationInput): BmadCliObservation => {
  const input = capturePortable(rawInput, "BMAD CLI observation");
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(input, ["command", "argv", "exitCode", "observedAt", "stdout", "stderr"]) ||
    input.command !== "bmad" ||
    !Array.isArray(input.argv) ||
    input.argv.length !== 1 ||
    input.argv[0] !== "--version" ||
    input.exitCode !== 0 ||
    input.stderr !== ""
  ) {
    throw new TypeError("BMAD CLI support is limited to successful `bmad --version` observations.");
  }
  assertTimestamp(input.observedAt, "BMAD CLI observations");
  if (input.stdout !== `${BMAD_ASSESSED_CLI_VERSION}\n`) {
    throw new TypeError("Unsupported BMAD CLI --version output.");
  }
  return cloneFrozen({ ...input, version: BMAD_ASSESSED_CLI_VERSION });
};
