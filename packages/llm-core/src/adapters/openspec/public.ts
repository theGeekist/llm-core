import {
  OPENSPEC_SOURCE_STATUS_CONTRACT,
  OPENSPEC_NPM_STATUS_CONTRACT,
  capturePortable,
  nonBlank,
  unique,
  isSourceArtifact,
  parseStatus,
  type OpenSpecStatusContract,
} from "./status-contract";
export {
  OPENSPEC_SOURCE_STATUS_CONTRACT,
  OPENSPEC_NPM_STATUS_CONTRACT,
  type OpenSpecStatusContract,
} from "./status-contract";
import { createHash } from "node:crypto";
import {
  contractVersion,
  digest,
  extensionNamespace,
  type ContractVersion,
  type JsonValue,
} from "#contracts";
import { cloneFrozen } from "#shared/portable-data";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  createSpecificationSourceSnapshot,
  type SpecificationDiagnostic,
  type SpecificationOperation,
  type SpecificationAdapterSupport,
  type SpecificationSourceSnapshot,
} from "@geekist/llm-core/specifications";

const FORMAT_ID = extensionNamespace("io.github.fission-ai.openspec");
const VERSION = contractVersion("1.6.0");
const EXTENSION = "io.github.fission-ai.openspec";
const STATUS_FIXTURE_DIGEST = digest(
  "7c45bfbba83da5767d78a9de82d3e98c71816b5c4036373fe58e50a81b2de335",
);
const SKIPPED_STATUS_FIXTURE_DIGEST = digest(
  "727f3a29de8876d627c1d743e8fdf45fbab2a236da4c567c99a22197609c79dc",
);
const NPM_STATUS_FIXTURE_DIGEST = digest(
  "972b1e4f3402e62b14bacce53eaa74f8d1a86e19b981290139634e165f4af15c",
);
const FILE_FIXTURE_DIGEST = digest(
  "de88ed452e28ed383ccab87565f543eda6a25871e2051310522e90303771fe8f",
);
const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

const sourceContract = (revision: string) => ({
  authority: "OpenSpec repository and published package",
  format: { id: FORMAT_ID, version: VERSION },
  revision,
});

const supported = <TOperation extends SpecificationOperation["operation"]>(
  operation: TOperation,
  revision: string,
  evidence: {
    readonly fixtures: readonly {
      readonly fixtureId: string;
      readonly digest: ReturnType<typeof digest>;
    }[];
    readonly diagnostics?: readonly SpecificationDiagnostic[];
  },
): SpecificationOperation & { readonly operation: TOperation } =>
  createSpecificationOperation({
    operation,
    sourceContract: sourceContract(revision),
    disposition: "supported",
    fixtures: evidence.fixtures,
    diagnostics: evidence.diagnostics ?? [],
  });

const unsupported = <TOperation extends SpecificationOperation["operation"]>(
  operation: TOperation,
  revision: string,
  reason: string,
): SpecificationOperation & { readonly operation: TOperation } =>
  createSpecificationOperation({
    operation,
    sourceContract: sourceContract(revision),
    disposition: "unsupported",
    diagnostics: [],
    reason,
  });

export const OPENSPEC_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport(
  {
    format: { id: FORMAT_ID, version: VERSION },
    authority: "OpenSpec repository and published package",
    revision: "19d41714c8b790488732687443713e406ef5aeef",
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", "19d41714c8b790488732687443713e406ef5aeef", {
        fixtures: [{ fixtureId: "openspec.file.current-spec.v1.6.0", digest: FILE_FIXTURE_DIGEST }],
      }),
      unsupported(
        "derive-portable-specification",
        "19d41714c8b790488732687443713e406ef5aeef",
        "OpenSpec file content is retained natively but is not yet derived into portable semantics.",
      ),
      unsupported(
        "compile-portable-specification",
        "19d41714c8b790488732687443713e406ef5aeef",
        "OpenSpec file compilation is not implemented.",
      ),
      unsupported(
        "export-native-source",
        "19d41714c8b790488732687443713e406ef5aeef",
        "OpenSpec file export is not implemented.",
      ),
      unsupported(
        "round-trip-native-source",
        "19d41714c8b790488732687443713e406ef5aeef",
        "OpenSpec file round trip is not implemented.",
      ),
    ],
  },
);

export const OPENSPEC_SOURCE_STATUS_CLI_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: VERSION },
    authority: "OpenSpec repository and published package",
    revision: OPENSPEC_SOURCE_STATUS_CONTRACT,
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", OPENSPEC_SOURCE_STATUS_CONTRACT, {
        fixtures: [{ fixtureId: "openspec.cli.status.v1.6.0", digest: STATUS_FIXTURE_DIGEST }],
      }),
      supported("derive-portable-specification", OPENSPEC_SOURCE_STATUS_CONTRACT, {
        fixtures: [
          { fixtureId: "openspec.cli.status.v1.6.0", digest: STATUS_FIXTURE_DIGEST },
          {
            fixtureId: "openspec.cli.status.skip-specs.v1.6.0",
            digest: SKIPPED_STATUS_FIXTURE_DIGEST,
          },
        ],
      }),
      unsupported(
        "compile-portable-specification",
        OPENSPEC_SOURCE_STATUS_CONTRACT,
        "OpenSpec status compilation is not implemented.",
      ),
      unsupported(
        "export-native-source",
        OPENSPEC_SOURCE_STATUS_CONTRACT,
        "OpenSpec status export is not implemented.",
      ),
      unsupported(
        "round-trip-native-source",
        OPENSPEC_SOURCE_STATUS_CONTRACT,
        "OpenSpec status round trip is not implemented.",
      ),
    ],
  });

export const OPENSPEC_NPM_STATUS_CLI_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: VERSION },
    authority: "OpenSpec repository and published package",
    revision: OPENSPEC_NPM_STATUS_CONTRACT,
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", OPENSPEC_NPM_STATUS_CONTRACT, {
        fixtures: [
          {
            fixtureId: "openspec.cli.status.npm-tarball.v1.6.0",
            digest: NPM_STATUS_FIXTURE_DIGEST,
          },
        ],
      }),
      supported("derive-portable-specification", OPENSPEC_NPM_STATUS_CONTRACT, {
        fixtures: [
          {
            fixtureId: "openspec.cli.status.npm-tarball.v1.6.0",
            digest: NPM_STATUS_FIXTURE_DIGEST,
          },
        ],
      }),
      unsupported(
        "compile-portable-specification",
        OPENSPEC_NPM_STATUS_CONTRACT,
        "OpenSpec status compilation is not implemented.",
      ),
      unsupported(
        "export-native-source",
        OPENSPEC_NPM_STATUS_CONTRACT,
        "OpenSpec status export is not implemented.",
      ),
      unsupported(
        "round-trip-native-source",
        OPENSPEC_NPM_STATUS_CONTRACT,
        "OpenSpec status round trip is not implemented.",
      ),
    ],
  });

export type OpenSpecFileKind = "root-config" | "current-specification" | "change-delta" | "archive";

export interface OpenSpecFileObservation {
  readonly documentId: string;
  readonly path: string;
  readonly content: string;
  readonly kind: OpenSpecFileKind;
}

export interface OpenSpecFileImportInput {
  readonly version: ContractVersion;
  readonly sourceId: string;
  readonly revision: string;
  readonly observedAt: string;
  /** File classes with different source authority must be imported separately. */
  readonly sourceRole: "primary" | "overlay" | "reference";
  readonly files: readonly OpenSpecFileObservation[];
}

export interface OpenSpecFileImportResult {
  readonly snapshot: SpecificationSourceSnapshot;
  readonly operation: SpecificationOperation;
}

export interface OpenSpecStatusCliInput {
  readonly version: ContractVersion;
  /** Exact runtime/build contract that emitted stdout; package version alone is ambiguous. */
  readonly contract: OpenSpecStatusContract;
  readonly sourceId: string;
  readonly revision: string;
  readonly observedAt: string;
  /** Exact stdout bytes from `openspec status --change <id> --json`. */
  readonly stdout: string;
}

export interface OpenSpecStatusImportResult {
  /** Detached portable graph input for `loadSpecification`. */
  readonly graph: unknown;
  readonly operation: SpecificationOperation;
}

const assertVersion = (version: ContractVersion): void => {
  if (version !== VERSION)
    throw new TypeError(`OpenSpec ${version} is unsupported; expected 1.6.0.`);
};

const assertStatusContract = (contract: OpenSpecStatusContract): void => {
  if (contract !== OPENSPEC_SOURCE_STATUS_CONTRACT && contract !== OPENSPEC_NPM_STATUS_CONTRACT) {
    throw new TypeError("OpenSpec status imports require an exact runtime/build contract.");
  }
};

const validFilePath = (file: OpenSpecFileObservation): boolean => {
  if (file.kind === "root-config") return file.path === "openspec/config.yaml";
  if (file.kind === "current-specification") {
    return /^openspec\/specs\/[^/]+\/spec\.md$/.test(file.path);
  }
  if (file.kind === "change-delta") {
    return /^openspec\/changes\/[^/]+\/specs\/[^/]+\/spec\.md$/.test(file.path);
  }
  return /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-[^/]+\/.+/.test(file.path);
};

const validRoleForFile = (
  role: OpenSpecFileImportInput["sourceRole"],
  kind: OpenSpecFileKind,
): boolean =>
  (role === "primary" && (kind === "root-config" || kind === "current-specification")) ||
  (role === "overlay" && kind === "change-delta") ||
  (role === "reference" && (kind === "current-specification" || kind === "archive"));

const assertFiles = (files: readonly OpenSpecFileObservation[]): void => {
  if (files.length === 0) throw new TypeError("OpenSpec file imports require observed files.");
  unique(
    files.map((file) => file.documentId),
    "OpenSpec document IDs",
  );
  unique(
    files.map((file) => file.path),
    "OpenSpec paths",
  );
  files.forEach((file) => {
    if (!nonBlank(file.documentId) || !nonBlank(file.content) || !validFilePath(file)) {
      throw new TypeError(
        "OpenSpec files must match the documented 1.6.0 layout and content boundary.",
      );
    }
  });
};

const fileDiagnostics = (
  sourceId: string,
  files: readonly OpenSpecFileObservation[],
): readonly SpecificationDiagnostic[] =>
  files.map((file) => ({
    code: "openspec.file-content-uninterpreted",
    severity: "warning",
    impact: "advisory",
    explanation:
      "The documented OpenSpec file and path are preserved, but its source-owned content is not promoted to canonical specification semantics.",
    source: { sourceId: sourceId as never, documentId: file.documentId },
  }));

export const importOpenSpecFiles = (
  rawInput: OpenSpecFileImportInput,
): OpenSpecFileImportResult => {
  const input = capturePortable(rawInput, "OpenSpec file input");
  assertVersion(input.version);
  assertFiles(input.files);
  if (!nonBlank(input.sourceId) || !nonBlank(input.revision)) {
    throw new TypeError("OpenSpec file imports require source and revision identities.");
  }
  if (!input.files.every((file) => validRoleForFile(input.sourceRole, file.kind))) {
    throw new TypeError(
      "OpenSpec primary, overlay, and reference files must be imported as separate source observations.",
    );
  }
  const diagnostics = fileDiagnostics(input.sourceId, input.files);
  const snapshot = createSpecificationSourceSnapshot({
    sourceId: input.sourceId as never,
    format: { id: FORMAT_ID, version: VERSION },
    revision: input.revision,
    contentDigest: sha256(input.files.map((file) => file.content).join("\u0000")),
    observedAt: input.observedAt,
    role: input.sourceRole,
    authority:
      input.sourceRole === "primary"
        ? "authoritative"
        : input.sourceRole === "overlay"
          ? "advisory"
          : "informative",
    documents: input.files.map((file) => ({
      documentId: file.documentId,
      content: { path: file.path, text: file.content, kind: file.kind },
    })),
    extensions: {
      [EXTENSION]: {
        contract: "documented-file-layout-v1.6.0",
        sourceOwnership: "source-owned",
        writeBack: "unsupported",
      },
    },
  });
  return cloneFrozen({
    snapshot,
    operation: supported("observe-native-source", "19d41714c8b790488732687443713e406ef5aeef", {
      fixtures: [{ fixtureId: "openspec.file.current-spec.v1.6.0", digest: FILE_FIXTURE_DIGEST }],
      diagnostics: diagnostics,
    }),
  });
};

const nodeId = (sourceId: string, changeName: string, artifactId: string): string =>
  `openspec.artifact.${createHash("sha256")
    .update(JSON.stringify([sourceId, changeName, artifactId]))
    .digest("hex")}`;

export const importOpenSpecStatusCli = (
  rawInput: OpenSpecStatusCliInput,
): OpenSpecStatusImportResult => {
  const input = capturePortable(rawInput, "OpenSpec CLI input");
  assertVersion(input.version);
  assertStatusContract(input.contract);
  if (!nonBlank(input.sourceId) || !nonBlank(input.revision) || !nonBlank(input.stdout)) {
    throw new TypeError("OpenSpec CLI observations require source, revision, and stdout.");
  }
  const status = parseStatus(input.stdout, input.contract);
  const sourceId = input.sourceId as never;
  const ids = new Map(
    status.artifacts.map((artifact) => [
      artifact.id,
      nodeId(input.sourceId, status.changeName, artifact.id),
    ]),
  );
  const diagnostics: readonly SpecificationDiagnostic[] =
    input.contract === OPENSPEC_NPM_STATUS_CONTRACT
      ? [
          {
            code: "openspec.status-dependencies-unavailable",
            severity: "warning",
            impact: "advisory",
            explanation:
              "The official OpenSpec 1.6.0 npm tarball omits each artifact's requires list; current missingDeps are preserved, but dependency relationships are not inferred.",
            source: { sourceId, documentId: "status.json" },
          },
        ]
      : [];
  const snapshot = createSpecificationSourceSnapshot({
    sourceId,
    format: { id: FORMAT_ID, version: VERSION },
    revision: input.revision,
    contentDigest: sha256(input.stdout),
    observedAt: input.observedAt,
    role: "generated",
    authority: "advisory",
    documents: [{ documentId: "status.json", content: status as unknown as JsonValue }],
    extensions: {
      [EXTENSION]: { command: "status --json", version: VERSION, contract: input.contract },
    },
  });
  const nodes = status.artifacts.map((artifact) => ({
    nodeId: ids.get(artifact.id)!,
    kind: "workflow",
    title: `${status.changeName}: ${artifact.id}`,
    source: { sourceId, documentId: "status.json", location: `/artifacts/${artifact.id}` },
    content: artifact as unknown as JsonValue,
    extensions: { [EXTENSION]: { schemaName: status.schemaName } },
  }));
  const relationships = status.artifacts.flatMap((artifact) =>
    isSourceArtifact(artifact)
      ? artifact.requires.map((required) => ({
          relationshipId: `openspec.relationship.${createHash("sha256")
            .update(JSON.stringify([input.sourceId, status.changeName, artifact.id, required]))
            .digest("hex")}`,
          kind: "depends-on",
          from: ids.get(artifact.id)!,
          to: ids.get(required)!,
          source: {
            sourceId,
            documentId: "status.json",
            location: `/artifacts/${artifact.id}/requires`,
          },
        }))
      : [],
  );
  return cloneFrozen({
    operation: supported("derive-portable-specification", input.contract, {
      fixtures: [
        input.contract === OPENSPEC_SOURCE_STATUS_CONTRACT
          ? { fixtureId: "openspec.cli.status.v1.6.0", digest: STATUS_FIXTURE_DIGEST }
          : {
              fixtureId: "openspec.cli.status.npm-tarball.v1.6.0",
              digest: NPM_STATUS_FIXTURE_DIGEST,
            },
      ],
      diagnostics: diagnostics,
    }),
    graph: {
      graphId: `openspec.status.${sha256(input.stdout).value}`,
      version: VERSION,
      sources: [snapshot],
      nodes,
      relationships,
    },
  });
};
