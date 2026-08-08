/* eslint-disable max-lines -- the public adapter front binds both exact OpenSpec 1.6.0 runtime contracts */
import { createHash } from "node:crypto";
import {
  contractVersion,
  digest,
  extensionNamespace,
  isJsonValue,
  type ContractVersion,
  type JsonObject,
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
const ASSESSED_SOURCE_AGENT_CONTRACT_DIGEST = digest(
  "b61e6a5a6c81acac55346061544a4fc63401e68b2fccb58da5e1632553fe06e7",
);
const PUBLISHED_NPM_STATUS_DECLARATION_DIGEST = digest(
  "03e039c50564badedf79f1437522f8be9f2caec9e7dbaa30b1518df16d5bc0f7",
);

const OPENSPEC_SOURCE_EVIDENCE = {
  evidenceId: "openspec.source.19d41714c8b790488732687443713e406ef5aeef.agent-contract",
  digest: ASSESSED_SOURCE_AGENT_CONTRACT_DIGEST,
} as const;
const OPENSPEC_NPM_EVIDENCE = {
  evidenceId:
    "openspec.npm-tarball.1.6.0.sha1-00b6f63e9671153b8621466a9ed423792349b54f.status-declaration",
  digest: PUBLISHED_NPM_STATUS_DECLARATION_DIGEST,
} as const;

export const OPENSPEC_SOURCE_STATUS_CONTRACT =
  "source-commit-19d41714c8b790488732687443713e406ef5aeef" as const;
export const OPENSPEC_NPM_STATUS_CONTRACT =
  "npm-tarball-1.6.0-sha1-00b6f63e9671153b8621466a9ed423792349b54f" as const;
export type OpenSpecStatusContract =
  | typeof OPENSPEC_SOURCE_STATUS_CONTRACT
  | typeof OPENSPEC_NPM_STATUS_CONTRACT;

const sha256 = (value: string) => digest(createHash("sha256").update(value).digest("hex"));

export const OPENSPEC_FILE_SUPPORT: SpecificationAdapterSupport = createSpecificationAdapterSupport(
  {
    format: { id: FORMAT_ID, version: VERSION },
    direction: "import",
    supportedVersions: [VERSION],
    levels: ["syntax"],
    features: [
      "documented-file-layout-observation",
      "file-content-preservation",
      "role-separated-current-and-change-sources",
    ],
    preservedExtensionNamespaces: [FORMAT_ID],
    sourceOwnership: "source-owned",
    writeBack: "unsupported",
    fixtures: [{ fixtureId: "openspec.file.current-spec.v1.6.0", digest: FILE_FIXTURE_DIGEST }],
    evidence: [OPENSPEC_SOURCE_EVIDENCE],
  },
);

export const OPENSPEC_SOURCE_STATUS_CLI_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: VERSION },
    direction: "import",
    supportedVersions: [VERSION],
    levels: ["syntax", "semantic"],
    features: [
      "status-json-source-commit-19d41714c8b790488732687443713e406ef5aeef",
      "artifact-status-observation",
      "artifact-dependency-relationships",
      "skipped-artifact-status",
    ],
    preservedExtensionNamespaces: [FORMAT_ID],
    sourceOwnership: "source-owned",
    writeBack: "unsupported",
    fixtures: [
      { fixtureId: "openspec.cli.status.v1.6.0", digest: STATUS_FIXTURE_DIGEST },
      {
        fixtureId: "openspec.cli.status.skip-specs.v1.6.0",
        digest: SKIPPED_STATUS_FIXTURE_DIGEST,
      },
    ],
    evidence: [OPENSPEC_SOURCE_EVIDENCE],
  });

export const OPENSPEC_NPM_STATUS_CLI_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: { id: FORMAT_ID, version: VERSION },
    direction: "import",
    supportedVersions: [VERSION],
    levels: ["syntax", "semantic"],
    features: [
      "status-json-npm-tarball-1.6.0",
      "artifact-status-observation",
      "dependency-semantics-unavailable",
    ],
    preservedExtensionNamespaces: [FORMAT_ID],
    sourceOwnership: "source-owned",
    writeBack: "unsupported",
    fixtures: [
      { fixtureId: "openspec.cli.status.npm-tarball.v1.6.0", digest: NPM_STATUS_FIXTURE_DIGEST },
    ],
    evidence: [OPENSPEC_NPM_EVIDENCE],
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
  readonly report: ConversionReport;
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
  readonly report: ConversionReport;
}

type ArtifactStatus = "done" | "skipped" | "ready" | "blocked";

interface CapturedStatusArtifactBase {
  readonly id: string;
  readonly outputPath: string;
  readonly status: ArtifactStatus;
  readonly missingDeps?: readonly string[];
}

interface CapturedSourceStatusArtifact extends CapturedStatusArtifactBase {
  readonly requires: readonly string[];
}

type CapturedNpmStatusArtifact = CapturedStatusArtifactBase;
type CapturedStatusArtifact = CapturedSourceStatusArtifact | CapturedNpmStatusArtifact;

interface CapturedStatus {
  readonly changeName: string;
  readonly schemaName: string;
  readonly planningHome: JsonObject;
  readonly changeRoot: string;
  readonly artifactPaths: JsonObject;
  readonly nextSteps: readonly string[];
  readonly actionContext: JsonObject;
  readonly isComplete: boolean;
  readonly applyRequires: readonly string[];
  readonly artifacts: readonly CapturedStatusArtifact[];
  readonly root: JsonObject;
}

const capturePortable = <T>(value: T, label: string): T => {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be closed portable JSON data.`);
  return cloneFrozen(value);
};

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(nonBlank);

const unique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`);
};

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

const fileIssues = (
  sourceId: string,
  files: readonly OpenSpecFileObservation[],
): readonly ConversionIssue[] =>
  files.map((file) => ({
    code: "openspec.file-content-uninterpreted",
    severity: "warning",
    disposition: "degraded",
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
  const issues = fileIssues(input.sourceId, input.files);
  const report = createConversionReport({ fidelity: "partial", issues });
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
  return cloneFrozen({ snapshot, report });
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> =>
  isPortableRecord(value) && hasOnlyKeys(value, required, optional);

const validArtifactPathEntry = (value: unknown): boolean =>
  exactRecord(value, ["outputPath", "resolvedOutputPath", "existingOutputPaths"]) &&
  nonBlank(value.outputPath) &&
  nonBlank(value.resolvedOutputPath) &&
  stringArray(value.existingOutputPaths);

const validActionContext = (value: unknown): value is JsonObject =>
  exactRecord(value, [
    "mode",
    "sourceOfTruth",
    "planningArtifacts",
    "linkedContext",
    "allowedEditRoots",
    "requiresAffectedAreaSelection",
    "constraints",
  ]) &&
  value.mode === "repo-local" &&
  value.sourceOfTruth === "repo" &&
  stringArray(value.planningArtifacts) &&
  Array.isArray(value.linkedContext) &&
  value.linkedContext.every((entry) => exactRecord(entry, ["name"]) && nonBlank(entry.name)) &&
  stringArray(value.allowedEditRoots) &&
  typeof value.requiresAffectedAreaSelection === "boolean" &&
  stringArray(value.constraints);

const validRoot = (value: unknown): value is JsonObject =>
  exactRecord(value, ["path", "source"], ["store_id"]) &&
  nonBlank(value.path) &&
  ["store", "declared", "global_default", "nearest", "implicit"].includes(String(value.source)) &&
  (value.store_id === undefined || nonBlank(value.store_id));

const validPlanningHome = (value: unknown): value is JsonObject =>
  exactRecord(value, ["kind", "root", "changesDir", "defaultSchema"]) &&
  value.kind === "repo" &&
  nonBlank(value.root) &&
  nonBlank(value.changesDir) &&
  value.defaultSchema === "spec-driven";

const parseArtifact = (
  value: unknown,
  contract: OpenSpecStatusContract,
): CapturedStatusArtifact => {
  const sourceContract = contract === OPENSPEC_SOURCE_STATUS_CONTRACT;
  if (
    !exactRecord(
      value,
      sourceContract ? ["id", "outputPath", "status", "requires"] : ["id", "outputPath", "status"],
      ["missingDeps"],
    )
  ) {
    throw new TypeError(
      `OpenSpec status artifacts do not match the declared ${contract} contract.`,
    );
  }
  if (
    !nonBlank(value.id) ||
    !nonBlank(value.outputPath) ||
    !(
      sourceContract ? ["done", "skipped", "ready", "blocked"] : ["done", "ready", "blocked"]
    ).includes(String(value.status)) ||
    (sourceContract && !stringArray(value.requires)) ||
    (value.missingDeps !== undefined && !stringArray(value.missingDeps))
  ) {
    throw new TypeError("OpenSpec status artifacts contain invalid values.");
  }
  if (
    (sourceContract &&
      stringArray(value.requires) &&
      new Set(value.requires).size !== value.requires.length) ||
    (value.status === "blocked") !== (value.missingDeps !== undefined) ||
    (value.missingDeps !== undefined &&
      new Set(value.missingDeps).size !== value.missingDeps.length)
  ) {
    throw new TypeError(
      "OpenSpec artifact dependencies must be unique, with missing dependencies only on blocked artifacts.",
    );
  }
  return value as unknown as CapturedStatusArtifact;
};

const isSourceArtifact = (
  artifact: CapturedStatusArtifact,
): artifact is CapturedSourceStatusArtifact => "requires" in artifact;

const parseStatus = (stdout: string, contract: OpenSpecStatusContract): CapturedStatus => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new TypeError("OpenSpec status stdout must contain exactly one JSON document.");
  }
  const value = capturePortable(parsed, "OpenSpec status payload");
  if (
    !exactRecord(value, [
      "changeName",
      "schemaName",
      "planningHome",
      "changeRoot",
      "artifactPaths",
      "nextSteps",
      "actionContext",
      "isComplete",
      "applyRequires",
      "artifacts",
      "root",
    ]) ||
    !nonBlank(value.changeName) ||
    !nonBlank(value.schemaName) ||
    !validPlanningHome(value.planningHome) ||
    !nonBlank(value.changeRoot) ||
    !isPortableRecord(value.artifactPaths) ||
    !Object.values(value.artifactPaths).every(validArtifactPathEntry) ||
    !stringArray(value.nextSteps) ||
    !validActionContext(value.actionContext) ||
    typeof value.isComplete !== "boolean" ||
    !stringArray(value.applyRequires) ||
    !Array.isArray(value.artifacts) ||
    !validRoot(value.root)
  ) {
    throw new TypeError("OpenSpec status stdout does not match the documented 1.6.0 contract.");
  }
  if (value.artifacts.length === 0) {
    throw new TypeError("OpenSpec status contracts require at least one artifact.");
  }
  const artifacts = value.artifacts.map((artifact) => parseArtifact(artifact, contract));
  const artifactPaths = value.artifactPaths as JsonObject;
  unique(
    artifacts.map((artifact) => artifact.id),
    "OpenSpec status artifact IDs",
  );
  const ids = new Set(artifacts.map((artifact) => artifact.id));
  const artifactPathIds = Object.keys(artifactPaths);
  if (
    artifactPathIds.length !== artifacts.length ||
    !artifactPathIds.every((id) => ids.has(id)) ||
    !value.applyRequires.every((id) => ids.has(id))
  ) {
    throw new TypeError("OpenSpec status artifact bindings must reference declared artifacts.");
  }
  const completed = new Set(
    artifacts
      .filter((artifact) => artifact.status === "done" || artifact.status === "skipped")
      .map((artifact) => artifact.id),
  );
  artifacts.forEach((artifact) => {
    const path = artifactPaths[artifact.id];
    if (
      !path ||
      !isPortableRecord(path) ||
      path.outputPath !== artifact.outputPath ||
      (isSourceArtifact(artifact) && artifact.requires.some((required) => !ids.has(required))) ||
      artifact.missingDeps?.some(
        (missing) =>
          !ids.has(missing) || (isSourceArtifact(artifact) && !artifact.requires.includes(missing)),
      )
    ) {
      throw new TypeError("OpenSpec status artifact bindings must remain internally consistent.");
    }
    if (isSourceArtifact(artifact)) {
      const unresolved = artifact.requires
        .filter((required) => !completed.has(required))
        .sort(compareUtf16CodeUnits);
      if (
        (artifact.status === "ready" && unresolved.length > 0) ||
        (artifact.status === "blocked" &&
          (artifact.missingDeps === undefined ||
            artifact.missingDeps.length !== unresolved.length ||
            artifact.missingDeps.some((missing, index) => missing !== unresolved[index])))
      ) {
        throw new TypeError(
          "OpenSpec artifact status dependencies must remain internally consistent.",
        );
      }
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (artifact: CapturedStatusArtifact): void => {
    if (visited.has(artifact.id)) return;
    if (visiting.has(artifact.id)) {
      throw new TypeError("OpenSpec status artifact dependencies must be acyclic.");
    }
    visiting.add(artifact.id);
    if (isSourceArtifact(artifact)) {
      artifact.requires.forEach((required) =>
        visit(artifacts.find((entry) => entry.id === required)!),
      );
    }
    visiting.delete(artifact.id);
    visited.add(artifact.id);
  };
  if (contract === OPENSPEC_SOURCE_STATUS_CONTRACT) artifacts.forEach(visit);
  unique(value.applyRequires, "OpenSpec apply requirements");
  unique(value.actionContext.planningArtifacts as readonly string[], "OpenSpec planning artifacts");
  if (
    (value.actionContext.planningArtifacts as readonly string[]).length !== artifacts.length ||
    !(value.actionContext.planningArtifacts as readonly string[]).every((id) => ids.has(id))
  ) {
    throw new TypeError(
      "OpenSpec planning artifacts must reference declared artifacts exactly once.",
    );
  }
  if (
    value.isComplete !==
    artifacts.every((artifact) => artifact.status === "done" || artifact.status === "skipped")
  ) {
    throw new TypeError("OpenSpec status completion must agree with artifact states.");
  }
  return cloneFrozen({ ...value, artifacts }) as unknown as CapturedStatus;
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
  const dependencyIssues: readonly ConversionIssue[] =
    input.contract === OPENSPEC_NPM_STATUS_CONTRACT
      ? [
          {
            code: "openspec.status-dependencies-unavailable",
            severity: "warning",
            disposition: "degraded",
            explanation:
              "The official OpenSpec 1.6.0 npm tarball omits each artifact's requires list; current missingDeps are preserved, but dependency relationships are not inferred.",
            source: { sourceId, documentId: "status.json" },
          },
        ]
      : [];
  const report = createConversionReport({
    fidelity: dependencyIssues.length === 0 ? "exact" : "partial",
    issues: dependencyIssues,
  });
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
    report,
    graph: {
      graphId: `openspec.status.${sha256(input.stdout).value}`,
      version: VERSION,
      sources: [snapshot],
      nodes,
      relationships,
      report,
    },
  });
};
