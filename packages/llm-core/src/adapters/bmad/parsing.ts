import { isJsonValue, type ContractVersion, type JsonObject } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type {
  BmadArtifact,
  BmadArtifactKind,
  BmadDevAutoStatus,
  BmadFileImportInput,
  BmadParsedOutcome,
  ParsedMemlog,
  ParsedMemoryRecord,
} from "./types";

interface ParsedFrontmatter {
  readonly fields: ReadonlyMap<string, string>;
  readonly bodyLines: readonly string[];
}

const artifactKinds: readonly BmadArtifactKind[] = [
  "canonical-spec",
  "planning-artifact",
  "story",
  "decision",
  "sprint-status",
  "dev-auto-spec",
  "dev-auto-result",
  "review",
  "memlog",
  "other",
];

const statuses: readonly BmadDevAutoStatus[] = [
  "draft",
  "ready-for-dev",
  "in-progress",
  "in-review",
  "done",
  "blocked",
];

export const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const assertTimestamp = (value: string, label: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new TypeError(`${label} requires an RFC 3339 UTC timestamp with milliseconds.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new TypeError(`${label} requires a valid observation timestamp.`);
  }
};

export const capturePortable = <T>(value: T, label: string): T => {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be closed portable JSON data.`);
  return cloneFrozen(value);
};

export const kindFor = (artifact: BmadArtifact): BmadArtifactKind => {
  if (artifact.kind !== undefined) return artifact.kind;
  const path = artifact.path.toLowerCase();
  if (path.endsWith(".memlog.md")) return "memlog";
  if (path.endsWith("/spec.md") || path === "spec.md") return "canonical-spec";
  if (path.endsWith("sprint-status.yaml") || path.endsWith("sprint-status.yml")) {
    return "sprint-status";
  }
  if (path.includes("dev-auto-result-")) return "dev-auto-result";
  if (path.includes("/stories/")) return "story";
  if (path.includes("spec-") && path.endsWith(".md")) return "dev-auto-spec";
  if (path.includes("review") || path.includes("readiness")) return "review";
  return "other";
};

export const nodeKindFor = (kind: BmadArtifactKind) => {
  switch (kind) {
    case "canonical-spec":
      return "requirement";
    case "decision":
      return "decision";
    case "story":
    case "planning-artifact":
      return "plan";
    case "sprint-status":
    case "dev-auto-spec":
    case "dev-auto-result":
      return "workflow";
    default:
      return "artifact";
  }
};

export const titleFor = (artifact: BmadArtifact): string => {
  for (const line of artifact.content.split(/\r?\n/)) {
    const heading = line.trimStart();
    if (!heading.startsWith("# ")) continue;
    const title = heading.slice(2).trim();
    if (title.length > 0) return title;
  }
  return artifact.path;
};

export const stableArtifacts = (artifacts: readonly BmadArtifact[]): readonly BmadArtifact[] =>
  [...artifacts].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

const assertArtifact = (artifact: BmadArtifact): void => {
  const kind = artifact.kind;
  if (
    !isPortableRecord(artifact) ||
    !hasOnlyKeys(artifact, ["path", "content"], ["kind"]) ||
    !nonBlank(artifact.path) ||
    typeof artifact.content !== "string" ||
    (kind !== undefined &&
      (typeof kind !== "string" || !artifactKinds.includes(kind as BmadArtifactKind)))
  ) {
    throw new TypeError("BMAD artifacts require a closed path, content, and optional kind shape.");
  }
};

export const assertFileInput = (input: BmadFileImportInput, version: ContractVersion): void => {
  if (
    !isPortableRecord(input) ||
    !hasOnlyKeys(input, ["version", "sourceId", "revision", "observedAt", "artifacts"])
  ) {
    throw new TypeError("BMAD file import input has an unsupported shape.");
  }
  if (input.version !== version)
    throw new TypeError(`Unsupported BMAD file version: ${input.version}.`);
  if (!nonBlank(input.sourceId) || !nonBlank(input.revision)) {
    throw new TypeError("BMAD imports require source and revision identities.");
  }
  assertTimestamp(input.observedAt, "BMAD file imports");
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0) {
    throw new TypeError("BMAD imports require at least one artifact.");
  }
  const paths = new Set<string>();
  input.artifacts.forEach((artifact) => {
    assertArtifact(artifact);
    if (paths.has(artifact.path)) throw new TypeError("BMAD artifact paths must be unique.");
    paths.add(artifact.path);
  });
};

const scalarValue = (raw: string): string => {
  const value = raw.trim();
  const quoted = value[0];
  if ((quoted === "'" || quoted === '"') && value.lastIndexOf(quoted) > 0) {
    return value.slice(1, value.lastIndexOf(quoted));
  }
  const comment = value.indexOf(" #");
  return (comment < 0 ? value : value.slice(0, comment)).trim();
};

const parseFrontmatter = (content: string, path: string): ParsedFrontmatter => {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") throw new TypeError(`BMAD artifact ${path} has no frontmatter.`);
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end < 0) throw new TypeError(`BMAD artifact ${path} has unterminated frontmatter.`);
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new TypeError(`BMAD artifact ${path} has invalid frontmatter.`);
    const key = line.slice(0, separator).trim();
    if (!key || fields.has(key)) {
      throw new TypeError(`BMAD artifact ${path} has duplicate or blank frontmatter keys.`);
    }
    fields.set(key, scalarValue(line.slice(separator + 1)));
  }
  return { fields, bodyLines: lines.slice(end + 1) };
};

const parseMemoryLabel = (label: string): { readonly type?: string; readonly by?: string } => {
  if (label.startsWith("by ")) return { by: label.slice(3) };
  const attribution = label.lastIndexOf(" by ");
  return attribution < 0
    ? { type: label }
    : { type: label.slice(0, attribution), by: label.slice(attribution + 4) };
};

const parseEntry = (line: string, path: string, bodyOrdinal: number): ParsedMemoryRecord => {
  if (!line.startsWith("- ") || line.length === 2) {
    throw new TypeError(`BMAD memlog ${path} has a non-entry body line.`);
  }
  const tagged = line.startsWith("- (");
  const labelEnd = tagged ? line.indexOf(") ", 3) : -1;
  if (tagged && labelEnd < 4) throw new TypeError(`BMAD memlog ${path} has an invalid entry.`);
  const label = labelEnd < 0 ? undefined : line.slice(3, labelEnd);
  const text = labelEnd < 0 ? line.slice(2) : line.slice(labelEnd + 2);
  const parsedLabel = label === undefined ? {} : parseMemoryLabel(label);
  if (
    !nonBlank(text) ||
    (parsedLabel.type !== undefined && !nonBlank(parsedLabel.type)) ||
    (parsedLabel.by !== undefined && !nonBlank(parsedLabel.by))
  ) {
    throw new TypeError(`BMAD memlog ${path} has an invalid entry.`);
  }
  return { path, bodyOrdinal, raw: line, text, ...parsedLabel };
};

export const parseMemlog = (artifact: BmadArtifact): ParsedMemlog => {
  const parsed = parseFrontmatter(artifact.content, artifact.path);
  const records = parsed.bodyLines
    .filter((line) => line.length > 0)
    .map((line, index) => parseEntry(line, artifact.path, index + 1));
  const frontmatter: JsonObject = {};
  parsed.fields.forEach((value, key) => {
    frontmatter[key] = value;
  });
  return { path: artifact.path, frontmatter, records };
};

const fieldAsStatus = (fields: ReadonlyMap<string, string>, path: string): BmadDevAutoStatus => {
  const status = fields.get("status");
  if (status === undefined || !statuses.includes(status as BmadDevAutoStatus)) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has an unsupported status.`);
  }
  return status as BmadDevAutoStatus;
};

const optionalRevision = (
  fields: ReadonlyMap<string, string>,
  key: string,
  path: string,
): string | undefined => {
  const value = fields.get(key);
  if (value !== undefined && !nonBlank(value)) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has a blank ${key}.`);
  }
  return value;
};

interface ResultLines {
  readonly present: boolean;
  readonly status?: string;
  readonly blockingCondition?: string;
}

const resultStart = (
  bodyLines: readonly string[],
  role: BmadDevAutoArtifactRole,
  path: string,
): number | undefined => {
  const expectedHeading = role === "result" ? "# BMad Dev Auto Result" : "## Auto Run Result";
  const headings = bodyLines.flatMap((line, index) =>
    line.trim() === expectedHeading ? [index] : [],
  );
  if (headings.length > 1) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has duplicate result sections.`);
  }
  const heading = headings[0];
  return heading === undefined ? undefined : heading + 1;
};

const addResultLine = (result: ResultLines, line: string): ResultLines => {
  if (line.startsWith("Status:")) {
    if (result.status !== undefined) {
      throw new TypeError("BMAD Auto Run Result has duplicate status lines.");
    }
    const status = line.slice("Status:".length).trim();
    if (!nonBlank(status) || !statuses.includes(status as BmadDevAutoStatus)) {
      throw new TypeError("BMAD Auto Run Result has an unsupported status.");
    }
    return { ...result, status };
  }
  if (line.startsWith("Blocking condition:")) {
    if (result.blockingCondition !== undefined) {
      throw new TypeError("BMAD Auto Run Result has duplicate blocking conditions.");
    }
    const blockingCondition = line.slice("Blocking condition:".length).trim();
    if (!nonBlank(blockingCondition)) {
      throw new TypeError("BMAD Auto Run Result has a blank blocking condition.");
    }
    return { ...result, blockingCondition };
  }
  return result;
};

const parseResultLines = (
  bodyLines: readonly string[],
  role: BmadDevAutoArtifactRole,
  path: string,
): ResultLines => {
  const start = resultStart(bodyLines, role, path);
  if (start === undefined) return { present: false };
  let result: ResultLines = { present: true };
  for (const line of bodyLines.slice(start)) {
    if (/^#{1,6}\s/.test(line)) break;
    result = addResultLine(result, line);
  }
  if (result.status === undefined) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has no result status.`);
  }
  return result;
};

interface OutcomeState {
  readonly path: string;
  readonly role: BmadDevAutoArtifactRole;
  readonly status: BmadDevAutoStatus;
  readonly result: ResultLines;
}

const terminalStatuses: readonly BmadDevAutoStatus[] = ["done", "blocked"];

const assertOutcomeConsistency = ({ path, role, status, result }: OutcomeState): void => {
  const terminal = terminalStatuses.includes(status);
  if (role === "result" && !terminal) {
    throw new TypeError(`BMAD Dev Auto result ${path} requires a terminal status.`);
  }
  if (terminal && !result.present) {
    throw new TypeError(`Terminal BMAD Dev Auto artifact ${path} requires one Auto Run Result.`);
  }
  if (terminal && result.status !== status) {
    throw new TypeError(
      `BMAD Dev Auto artifact ${path} contradicts its current frontmatter status.`,
    );
  }
  if (terminal && status === "blocked" && !nonBlank(result.blockingCondition)) {
    throw new TypeError(`Blocked BMAD outcome ${path} requires a blocking condition.`);
  }
  if (result.status === status && status !== "blocked" && result.blockingCondition !== undefined) {
    throw new TypeError(`Non-blocked BMAD outcome ${path} cannot carry a blocking condition.`);
  }
};

const reviewLoopNumber = (value: string, path: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has an invalid review loop.`);
  }
  const iteration = Number(value);
  if (!Number.isSafeInteger(iteration) || iteration > 6) {
    throw new TypeError(`BMAD Dev Auto artifact ${path} has an invalid review loop.`);
  }
  return iteration;
};

const parseReviewLoop = (fields: ReadonlyMap<string, string>, path: string): number | undefined => {
  const value = fields.get("review_loop_iteration");
  return value === undefined ? undefined : reviewLoopNumber(value, path);
};

export type BmadDevAutoArtifactRole = "spec" | "result";

const normalizedPath = (path: string): string => path.replaceAll("\\", "/");

const hasBodyLine = (content: string, expected: string): boolean =>
  content.split(/\r?\n/).some((line) => line.trim() === expected);

export const devAutoArtifactRoleFor = (
  artifact: BmadArtifact,
): BmadDevAutoArtifactRole | undefined => {
  const path = normalizedPath(artifact.path);
  const resultPath = /(?:^|\/)bmad-dev-auto-result-[^/]+\.md$/.test(path);
  const specPath = /(?:^|\/)(?:spec-[^/]+|stories\/[^/]+)\.md$/.test(path);
  const specContent =
    hasBodyLine(artifact.content, "<intent-contract>") ||
    hasBodyLine(artifact.content, "## Auto Run Result");
  return resultPath ? "result" : specPath && specContent ? "spec" : undefined;
};

const NON_CONVERGENCE = "review repair loop exceeded 5 iterations (non-convergence)";

interface ReviewLoopState {
  readonly path: string;
  readonly status: BmadDevAutoStatus;
  readonly blockingCondition?: string;
  readonly reviewLoopIteration?: number;
}

const assertReviewLoopConsistency = ({
  path,
  status,
  blockingCondition,
  reviewLoopIteration,
}: ReviewLoopState): void => {
  if (
    reviewLoopIteration === 6 &&
    (status !== "blocked" || blockingCondition !== NON_CONVERGENCE)
  ) {
    throw new TypeError(
      `BMAD Dev Auto artifact ${path} may reach review loop 6 only at blocked non-convergence.`,
    );
  }
  if (status === "blocked" && blockingCondition === NON_CONVERGENCE && reviewLoopIteration !== 6) {
    throw new TypeError(
      `BMAD Dev Auto artifact ${path} requires review loop 6 at blocked non-convergence.`,
    );
  }
};

export const parseDevAutoOutcome = (
  artifact: BmadArtifact,
  role: BmadDevAutoArtifactRole,
): BmadParsedOutcome => {
  const { fields, bodyLines } = parseFrontmatter(artifact.content, artifact.path);
  const status = fieldAsStatus(fields, artifact.path);
  const result = parseResultLines(bodyLines, role, artifact.path);
  assertOutcomeConsistency({ path: artifact.path, role, status, result });
  const reviewLoopIteration = parseReviewLoop(fields, artifact.path);
  const baselineRevision = optionalRevision(fields, "baseline_revision", artifact.path);
  const finalRevision = optionalRevision(fields, "final_revision", artifact.path);
  if (status === "done" && (baselineRevision === undefined || finalRevision === undefined)) {
    throw new TypeError(
      `Done BMAD outcome ${artifact.path} requires baseline_revision and final_revision.`,
    );
  }
  assertReviewLoopConsistency({
    path: artifact.path,
    status,
    ...(status === "blocked" && result.blockingCondition !== undefined
      ? { blockingCondition: result.blockingCondition }
      : {}),
    ...(reviewLoopIteration === undefined ? {} : { reviewLoopIteration }),
  });
  return {
    status,
    artifactPath: artifact.path,
    ...(status !== "blocked" || result.blockingCondition === undefined
      ? {}
      : { blockingCondition: result.blockingCondition }),
    ...(reviewLoopIteration === undefined ? {} : { reviewLoopIteration }),
    ...(baselineRevision === undefined ? {} : { baselineRevision }),
    ...(finalRevision === undefined ? {} : { finalRevision }),
  };
};

export const unparsedConventionFor = (kind: BmadArtifactKind): string => {
  switch (kind) {
    case "memlog":
      return "memlog descriptive frontmatter";
    case "dev-auto-spec":
    case "dev-auto-result":
      return "Dev Auto body, intent, change-log, triage-log, and non-lifecycle frontmatter";
    case "sprint-status":
      return "sprint-status YAML keys and lifecycle semantics";
    case "story":
      return "story sections and status conventions";
    case "canonical-spec":
      return "canonical SPEC sections and companion precedence";
    default:
      return `${kind} document conventions`;
  }
};
