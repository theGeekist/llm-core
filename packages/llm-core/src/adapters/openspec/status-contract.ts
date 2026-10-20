import {
  contractVersion,
  digest,
  extensionNamespace,
  isJsonValue,
  type JsonObject,
} from "#contracts";
import { createHash } from "node:crypto";
import { compareUtf16CodeUnits } from "#shared/fp";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";

// Repository source and the published tarball have different artifact contracts.
// These immutable identities preserve that distinction even at the same version.
const sourceRevision = "19d41714c8b790488732687443713e406ef5aeef";
const packageVersion = "1.6.0";
const tarballSha1 = "00b6f63e9671153b8621466a9ed423792349b54f";

export const openSpecContract = cloneFrozen({
  authority: "OpenSpec repository and published package",
  format: Object.freeze({
    id: extensionNamespace("io.github.fission-ai.openspec"),
    version: contractVersion(packageVersion),
  }),
  sourceRevision,
  fileLayout: "documented-file-layout-v1.6.0",
  statusDocumentId: "status.json",
  statusCommand: "status --json",
  diagnostics: {
    fileContentUninterpreted: {
      code: "openspec.file-content-uninterpreted",
      severity: "warning",
      impact: "advisory",
      explanation:
        "The documented OpenSpec file and path are preserved, but its source-owned content is not promoted to canonical specification semantics.",
    },
    statusDependenciesUnavailable: {
      code: "openspec.status-dependencies-unavailable",
      severity: "warning",
      impact: "advisory",
      explanation:
        "The official OpenSpec 1.6.0 npm tarball omits each artifact's requires list; current missingDeps are preserved, but dependency relationships are not inferred.",
    },
  },
  fixtures: Object.freeze({
    file: {
      fixtureId: "openspec.file.current-spec.v1.6.0",
      digest: digest("de88ed452e28ed383ccab87565f543eda6a25871e2051310522e90303771fe8f"),
    },
    sourceStatus: {
      fixtureId: "openspec.cli.status.v1.6.0",
      digest: digest("7c45bfbba83da5767d78a9de82d3e98c71816b5c4036373fe58e50a81b2de335"),
    },
    skippedSourceStatus: {
      fixtureId: "openspec.cli.status.skip-specs.v1.6.0",
      digest: digest("727f3a29de8876d627c1d743e8fdf45fbab2a236da4c567c99a22197609c79dc"),
    },
    publishedStatus: {
      fixtureId: "openspec.cli.status.npm-tarball.v1.6.0",
      digest: digest("972b1e4f3402e62b14bacce53eaa74f8d1a86e19b981290139634e165f4af15c"),
    },
  }),
} as const);

export const openSpecStatusContracts = cloneFrozen({
  repository: Object.freeze({
    identity: `source-commit-${sourceRevision}` as const,
    revision: sourceRevision,
    artifactStates: ["done", "skipped", "ready", "blocked"] as const,
    artifactRequiredFields: ["id", "outputPath", "status", "requires"] as const,
    hasDependencyEdges: true,
    fixture: openSpecContract.fixtures.sourceStatus,
  }),
  publishedPackage: Object.freeze({
    identity: `npm-tarball-${packageVersion}-sha1-${tarballSha1}` as const,
    packageVersion,
    integrity: Object.freeze({ algorithm: "sha1", value: tarballSha1 }),
    artifactStates: ["done", "ready", "blocked"] as const,
    artifactRequiredFields: ["id", "outputPath", "status"] as const,
    hasDependencyEdges: false,
    fixture: openSpecContract.fixtures.publishedStatus,
  }),
} as const);

export const OPENSPEC_SOURCE_STATUS_CONTRACT = openSpecStatusContracts.repository.identity;
export const OPENSPEC_NPM_STATUS_CONTRACT = openSpecStatusContracts.publishedPackage.identity;
export type OpenSpecStatusContract =
  | typeof OPENSPEC_SOURCE_STATUS_CONTRACT
  | typeof OPENSPEC_NPM_STATUS_CONTRACT;
type ArtifactStatus = (typeof openSpecStatusContracts.repository.artifactStates)[number];

export const statusContractDefinition = (contract: OpenSpecStatusContract) =>
  contract === OPENSPEC_SOURCE_STATUS_CONTRACT
    ? openSpecStatusContracts.repository
    : openSpecStatusContracts.publishedPackage;

/** Stable source-owned identity, including the source observation to avoid cross-source collisions. */
export const statusArtifactIdentity = (
  sourceId: string,
  changeName: string,
  artifactId: string,
): string =>
  `openspec.artifact.${createHash("sha256")
    .update(JSON.stringify([sourceId, changeName, artifactId]))
    .digest("hex")}`;

/** Preserve edge direction and the exact legacy tuple bytes; this is not a core UUID. */
export const statusDependencyIdentity = (
  sourceId: string,
  changeName: string,
  edge: { readonly artifactId: string; readonly requiredId: string },
): string =>
  `openspec.relationship.${createHash("sha256")
    .update(JSON.stringify([sourceId, changeName, edge.artifactId, edge.requiredId]))
    .digest("hex")}`;

export const statusGraphIdentity = (stdout: string): string =>
  `openspec.status.${createHash("sha256").update(stdout).digest("hex")}`;

export const statusArtifactBinding = (sourceId: string, artifactId: string) => ({
  sourceId,
  documentId: openSpecContract.statusDocumentId,
  location: `/artifacts/${artifactId}`,
});

/** Location of native dependency evidence for a declared artifact. */
export const statusDependencyBinding = (sourceId: string, artifactId: string) => ({
  ...statusArtifactBinding(sourceId, artifactId),
  location: `/artifacts/${artifactId}/requires`,
});

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

export const capturePortable = <T>(value: T, label: string): T => {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be closed portable JSON data.`);
  return cloneFrozen(value);
};

export const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(nonBlank);

export const unique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`);
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
  const definition = statusContractDefinition(contract);
  const sourceContract = definition.hasDependencyEdges;
  if (!exactRecord(value, definition.artifactRequiredFields, ["missingDeps"])) {
    throw new TypeError(
      `OpenSpec status artifacts do not match the declared ${contract} contract.`,
    );
  }
  if (
    !nonBlank(value.id) ||
    !nonBlank(value.outputPath) ||
    typeof value.status !== "string" ||
    !definition.artifactStates.some((state) => state === value.status) ||
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

export const isSourceArtifact = (
  artifact: CapturedStatusArtifact,
): artifact is CapturedSourceStatusArtifact => "requires" in artifact;

export const parseStatus = (stdout: string, contract: OpenSpecStatusContract): CapturedStatus => {
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
