import {
  OPENSPEC_SOURCE_STATUS_CONTRACT,
  OPENSPEC_NPM_STATUS_CONTRACT,
  capturePortable,
  nonBlank,
  unique,
  isSourceArtifact,
  parseStatus,
  openSpecContract,
  statusContractDefinition,
  statusArtifactIdentity,
  statusDependencyIdentity,
  statusGraphIdentity,
  statusArtifactBinding,
  statusDependencyBinding,
  type OpenSpecStatusContract,
} from "./status-contract";
export {
  OPENSPEC_SOURCE_STATUS_CONTRACT,
  OPENSPEC_NPM_STATUS_CONTRACT,
  type OpenSpecStatusContract,
} from "./status-contract";
import { createHash } from "node:crypto";
import { digest, type ContractVersion, type JsonValue } from "#contracts";
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

const { format, authority, fixtures } = openSpecContract;
const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

const sourceContract = (revision: string) => ({
  authority: authority,
  format: format,
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
    format: format,
    authority: authority,
    revision: openSpecContract.sourceRevision,
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", openSpecContract.sourceRevision, {
        fixtures: [fixtures.file],
      }),
      unsupported(
        "derive-portable-specification",
        openSpecContract.sourceRevision,
        "OpenSpec file content is retained natively but is not yet derived into portable semantics.",
      ),
      unsupported(
        "compile-portable-specification",
        openSpecContract.sourceRevision,
        "OpenSpec file compilation is not implemented.",
      ),
      unsupported(
        "export-native-source",
        openSpecContract.sourceRevision,
        "OpenSpec file export is not implemented.",
      ),
      unsupported(
        "round-trip-native-source",
        openSpecContract.sourceRevision,
        "OpenSpec file round trip is not implemented.",
      ),
    ],
  },
);

export const OPENSPEC_SOURCE_STATUS_CLI_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: format,
    authority: authority,
    revision: OPENSPEC_SOURCE_STATUS_CONTRACT,
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", OPENSPEC_SOURCE_STATUS_CONTRACT, {
        fixtures: [fixtures.sourceStatus],
      }),
      supported("derive-portable-specification", OPENSPEC_SOURCE_STATUS_CONTRACT, {
        fixtures: [fixtures.sourceStatus, fixtures.skippedSourceStatus],
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
    format: format,
    authority: authority,
    revision: OPENSPEC_NPM_STATUS_CONTRACT,
    sourceOwnership: "source-owned",
    operations: [
      supported("observe-native-source", OPENSPEC_NPM_STATUS_CONTRACT, {
        fixtures: [fixtures.publishedStatus],
      }),
      supported("derive-portable-specification", OPENSPEC_NPM_STATUS_CONTRACT, {
        fixtures: [fixtures.publishedStatus],
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
  if (version !== format.version)
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
    ...openSpecContract.diagnostics.fileContentUninterpreted,
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
    format: format,
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
      [format.id]: {
        contract: openSpecContract.fileLayout,
        sourceOwnership: "source-owned",
        writeBack: "unsupported",
      },
    },
  });
  return cloneFrozen({
    snapshot,
    operation: supported("observe-native-source", openSpecContract.sourceRevision, {
      fixtures: [fixtures.file],
      diagnostics: diagnostics,
    }),
  });
};

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
      statusArtifactIdentity(input.sourceId, status.changeName, artifact.id),
    ]),
  );
  const diagnostics: readonly SpecificationDiagnostic[] =
    input.contract === OPENSPEC_NPM_STATUS_CONTRACT
      ? [
          {
            ...openSpecContract.diagnostics.statusDependenciesUnavailable,
            source: { sourceId, documentId: openSpecContract.statusDocumentId },
          },
        ]
      : [];
  const snapshot = createSpecificationSourceSnapshot({
    sourceId,
    format: format,
    revision: input.revision,
    contentDigest: sha256(input.stdout),
    observedAt: input.observedAt,
    role: "generated",
    authority: "advisory",
    documents: [
      { documentId: openSpecContract.statusDocumentId, content: status as unknown as JsonValue },
    ],
    extensions: {
      [format.id]: {
        command: openSpecContract.statusCommand,
        version: format.version,
        contract: input.contract,
      },
    },
  });
  const nodes = status.artifacts.map((artifact) => ({
    nodeId: ids.get(artifact.id)!,
    kind: "workflow",
    title: `${status.changeName}: ${artifact.id}`,
    source: statusArtifactBinding(sourceId, artifact.id),
    content: artifact as unknown as JsonValue,
    extensions: { [format.id]: { schemaName: status.schemaName } },
  }));
  const relationships = status.artifacts.flatMap((artifact) =>
    isSourceArtifact(artifact)
      ? artifact.requires.map((required) => ({
          relationshipId: statusDependencyIdentity(input.sourceId, status.changeName, {
            artifactId: artifact.id,
            requiredId: required,
          }),
          kind: "depends-on",
          from: ids.get(artifact.id)!,
          to: ids.get(required)!,
          source: statusDependencyBinding(sourceId, artifact.id),
        }))
      : [],
  );
  return cloneFrozen({
    operation: supported("derive-portable-specification", input.contract, {
      fixtures: [statusContractDefinition(input.contract).fixture],
      diagnostics: diagnostics,
    }),
    graph: {
      graphId: statusGraphIdentity(input.stdout),
      version: format.version,
      sources: [snapshot],
      nodes,
      relationships,
    },
  });
};
