import { isJsonValue, type JsonObject } from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";

export const OPENSPEC_SOURCE_STATUS_CONTRACT =
  "source-commit-19d41714c8b790488732687443713e406ef5aeef" as const;
export const OPENSPEC_NPM_STATUS_CONTRACT =
  "npm-tarball-1.6.0-sha1-00b6f63e9671153b8621466a9ed423792349b54f" as const;
export type OpenSpecStatusContract =
  | typeof OPENSPEC_SOURCE_STATUS_CONTRACT
  | typeof OPENSPEC_NPM_STATUS_CONTRACT;

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
