// Layer 4 planning. Turns desired AIFSD-owned outputs plus the observed
// workspace into a classified, inspectable change plan. Planning is pure: it
// performs no filesystem writes and never decides to overwrite user-owned work
// — that becomes a conflict the caller must resolve (CONFIGURATION.md
// "Materialization" and "Generated artifact ownership").

import type { Digest } from "@geekist/llm-core/contracts";
import type {
  DesiredArtifact,
  ChangePlan,
  ChangePlanInput,
  PlannedChange,
  WorkspaceArtifact,
} from "./contract.js";
import { contentDigest, digestsEqual } from "./content-digest.js";
import { freezeConfigurationData } from "./diagnostics.js";

// A materializable path must be canonical and workspace-relative: no absolute
// roots, no drive letters, no backslashes, and no "", "." or ".." segments.
// Anything else is a path ambiguity the planner refuses to reason about.
export const isCanonicalWorkspacePath = (path: unknown): path is string => {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

const assertCanonicalPath = (path: unknown, label: string): void => {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (!isCanonicalWorkspacePath(path)) {
    throw new Error(`${label} '${path}' is not a canonical workspace-relative path`);
  }
};

const assertUnique = (values: readonly string[], label: string): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains a duplicate path '${value}'`);
    }
    seen.add(value);
  }
};

/**
 * Reject every path ambiguity up front: non-canonical paths, duplicate workspace
 * or desired targets, duplicate rename sources, and any rename source that
 * collides with another desired target (which also catches cyclic renames).
 */
const assertPathSafety = (input: ChangePlanInput): void => {
  for (const artifact of input.workspace.artifacts) {
    assertCanonicalPath(artifact.path, "workspace path");
  }
  assertUnique(
    input.workspace.artifacts.map((artifact) => artifact.path),
    "workspace",
  );

  const desiredPaths: string[] = [];
  const renameSources: string[] = [];
  for (const desired of input.desired) {
    assertCanonicalPath(desired.path, "desired path");
    desiredPaths.push(desired.path);
    if (desired.previousPath !== undefined && desired.previousPath !== desired.path) {
      assertCanonicalPath(desired.previousPath, "rename source path");
      renameSources.push(desired.previousPath);
    }
  }
  assertUnique(desiredPaths, "desired");
  assertUnique(renameSources, "rename source");

  const desiredTargets = new Set(desiredPaths);
  for (const source of renameSources) {
    if (desiredTargets.has(source)) {
      throw new Error(`rename source '${source}' collides with another desired target`);
    }
  }
};

const classifyExisting = (
  desired: DesiredArtifact,
  existing: WorkspaceArtifact,
  contentDigestValue: Digest,
): PlannedChange => {
  const base = {
    path: desired.path,
    ownership: existing.ownership,
    content: desired.content,
    contentDigest: contentDigestValue,
    expectedCurrentDigest: existing.contentDigest,
  } as const;
  if (digestsEqual(existing.contentDigest, contentDigestValue)) {
    return { ...base, change: "unchanged", reasonCode: "content-already-current" };
  }
  if (existing.ownership === "user-owned") {
    return {
      ...base,
      change: "conflict",
      reasonCode: "user-owned-content-conflict",
    };
  }
  if (existing.ownership === "shared") {
    return { ...base, change: "merge", reasonCode: "shared-content-requires-merge" };
  }
  return { ...base, change: "update-owned-region", reasonCode: "aifsd-owned-content-stale" };
};

interface DesiredOutcome {
  readonly change: PlannedChange;
  /** Workspace source path this change consumes; reserved from deletion. */
  readonly reservedSource?: string;
}

const planForDesired = (
  desired: DesiredArtifact,
  byPath: ReadonlyMap<string, WorkspaceArtifact>,
): DesiredOutcome => {
  // The planner always recomputes the target digest; it is never caller-supplied.
  const contentDigestValue = contentDigest(desired.content);
  if (desired.previousPath && desired.previousPath !== desired.path) {
    const previous = byPath.get(desired.previousPath);
    const destination = byPath.get(desired.path);
    // A rename may target ONLY an AIFSD-owned source, and the destination must
    // be ABSENT. Relabelling a shared/user-owned source or overwriting an
    // occupied destination is a conflict, never a silent rename.
    if (previous && (previous.ownership !== "aifsd-owned" || destination !== undefined)) {
      return {
        change: {
          path: desired.previousPath,
          ownership: previous.ownership,
          change: "conflict",
          reasonCode:
            previous.ownership !== "aifsd-owned"
              ? "rename-source-not-aifsd-owned"
              : "rename-destination-occupied",
          expectedCurrentDigest: previous.contentDigest,
        },
        reservedSource: desired.previousPath,
      };
    }
    if (previous) {
      return {
        change: {
          path: desired.previousPath,
          renameTo: desired.path,
          ownership: "aifsd-owned",
          change: "rename",
          reasonCode: "artifact-renamed",
          content: desired.content,
          contentDigest: contentDigestValue,
          expectedCurrentDigest: previous.contentDigest,
        },
        reservedSource: desired.previousPath,
      };
    }
  }
  const existing = byPath.get(desired.path);
  if (!existing) {
    if (desired.ownership === "user-owned") {
      return {
        change: {
          path: desired.path,
          ownership: "user-owned",
          change: "conflict",
          reasonCode: "user-owned-artifact-absent",
          expectedCurrentDigest: null,
        },
      };
    }
    return {
      change: {
        path: desired.path,
        ownership: desired.ownership,
        change: "create",
        reasonCode: "artifact-absent",
        content: desired.content,
        contentDigest: contentDigestValue,
        expectedCurrentDigest: null,
      },
    };
  }
  return { change: classifyExisting(desired, existing, contentDigestValue) };
};

/** Produce a classified, ownership-safe change plan. Pure and previewable. */
export const planChanges = (input: ChangePlanInput): ChangePlan => {
  assertPathSafety(input);
  const byPath = new Map(input.workspace.artifacts.map((artifact) => [artifact.path, artifact]));
  const desiredPaths = new Set<string>();
  const reservedSources = new Set<string>();
  const changes: PlannedChange[] = [];

  for (const desired of input.desired) {
    desiredPaths.add(desired.path);
    const outcome = planForDesired(desired, byPath);
    if (outcome.reservedSource !== undefined) {
      reservedSources.add(outcome.reservedSource);
    }
    changes.push(outcome.change);
  }

  // AIFSD-owned artifacts no longer desired are deleted as a visible action.
  for (const artifact of input.workspace.artifacts) {
    if (desiredPaths.has(artifact.path) || reservedSources.has(artifact.path)) {
      continue;
    }
    if (artifact.ownership === "aifsd-owned") {
      changes.push({
        path: artifact.path,
        ownership: "aifsd-owned",
        change: "delete",
        reasonCode: "artifact-no-longer-produced",
        expectedCurrentDigest: artifact.contentDigest,
      });
    }
  }

  // Clone the complete planned graph so deep-freezing a preview cannot freeze a
  // nested digest still owned by the caller's workspace input.
  const owned = structuredClone(changes);
  const preview = { lockDigest: contentDigest(input.lock), changes: owned };
  return freezeConfigurationData({ ...preview, planDigest: contentDigest(preview) });
};
