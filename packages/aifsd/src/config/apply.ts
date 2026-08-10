// Layer 4 materialization. Applies an already-classified change plan against a
// workspace port. The plan must match the approved lock, and every write
// precondition is rechecked in a full preflight BEFORE any apply runs, so
// planning-time workspace drift aborts before the first write. Apply calls are
// sequential; cross-file atomicity for an apply-time failure belongs to the
// workspace port (CONFIGURATION.md "Materialization" and "Generated artifact
// ownership").
//
// Composition is conditional over MaybePromise: a synchronous workspace
// yields a synchronous result; the call only becomes async when observe/apply
// return a thenable.

import { isDigest, type Digest } from "@geekist/llm-core/contracts";
import { maybeAll, maybeThen } from "@wpkernel/pipeline/core";
import type {
  ChangeApplicationStatus,
  ConfigurationResult,
  ConfigurationDiagnostic,
  ConfigurationDiagnosticReasonCode,
  ChangePlan,
  ApplyResult,
  ArtifactWriter,
  ApplyDependencies,
  MaybePromise,
  PlannedChange,
} from "./contract.js";
import { contentDigest, digestsEqual } from "./content-digest.js";
import {
  captureConfigurationData,
  diagnostic,
  freezeConfigurationData,
  isObjectRecord,
  unexpectedFieldDiagnostics,
} from "./diagnostics.js";
import { isCanonicalWorkspacePath } from "./plan.js";

const stalePlan = (
  reasonCode: ConfigurationDiagnosticReasonCode,
  path?: string,
): ConfigurationResult<ApplyResult> => ({
  ok: false,
  diagnostics: [diagnostic("stale-plan", reasonCode, path)],
});

const PLAN_KEYS = ["lockDigest", "planDigest", "changes"] as const;
const CHANGE_KEYS = [
  "path",
  "ownership",
  "change",
  "renameTo",
  "reasonCode",
  "content",
  "contentDigest",
  "expectedCurrentDigest",
] as const;
const OWNERSHIP = new Set(["aifsd-owned", "shared", "user-owned"]);
const CHANGE_CLASSES = new Set([
  "create",
  "update-owned-region",
  "merge",
  "conflict",
  "unchanged",
  "delete",
  "rename",
]);
const CONTENT_REQUIRED = new Set(["create", "update-owned-region", "merge", "unchanged", "rename"]);
const REASONS_BY_CHANGE: Readonly<Record<string, ReadonlySet<string>>> = {
  create: new Set(["artifact-absent"]),
  "update-owned-region": new Set(["aifsd-owned-content-stale"]),
  merge: new Set(["shared-content-requires-merge"]),
  conflict: new Set([
    "user-owned-content-conflict",
    "user-owned-artifact-absent",
    "rename-source-not-aifsd-owned",
    "rename-destination-occupied",
  ]),
  unchanged: new Set(["content-already-current"]),
  delete: new Set(["artifact-no-longer-produced"]),
  rename: new Set(["artifact-renamed"]),
};

const invalidPlan = (
  reasonCode: ConfigurationDiagnosticReasonCode,
  path: string,
): ConfigurationDiagnostic => diagnostic("stale-plan", reasonCode, path);

const validateChangeShape = (
  value: Record<string, unknown>,
  path: string,
): ConfigurationDiagnostic[] => {
  const diagnostics = unexpectedFieldDiagnostics(value, CHANGE_KEYS, { path, code: "stale-plan" });
  if (!isCanonicalWorkspacePath(value.path)) {
    diagnostics.push(invalidPlan("non-canonical-path", `${path}/path`));
  }
  if (typeof value.ownership !== "string" || !OWNERSHIP.has(value.ownership)) {
    diagnostics.push(invalidPlan("invalid-enum-value", `${path}/ownership`));
  }
  if (typeof value.change !== "string" || !CHANGE_CLASSES.has(value.change)) {
    diagnostics.push(invalidPlan("invalid-enum-value", `${path}/change`));
  }
  if (
    typeof value.reasonCode !== "string" ||
    !(REASONS_BY_CHANGE[value.change as string]?.has(value.reasonCode) ?? false)
  ) {
    diagnostics.push(invalidPlan("invalid-reason-code", `${path}/reasonCode`));
  }
  if (!(value.expectedCurrentDigest === null || isDigest(value.expectedCurrentDigest))) {
    diagnostics.push(invalidPlan("invalid-precondition", `${path}/expectedCurrentDigest`));
  }
  return diagnostics;
};

const validateChangePrecondition = (
  value: Record<string, unknown>,
  path: string,
): ConfigurationDiagnostic[] => {
  if (value.change === "create" && value.expectedCurrentDigest !== null) {
    return [invalidPlan("precondition-kind-mismatch", `${path}/expectedCurrentDigest`)];
  }
  if (value.reasonCode === "user-owned-artifact-absent" && value.expectedCurrentDigest !== null) {
    return [invalidPlan("precondition-kind-mismatch", `${path}/expectedCurrentDigest`)];
  }
  if (
    typeof value.change === "string" &&
    value.change !== "create" &&
    value.reasonCode !== "user-owned-artifact-absent" &&
    value.expectedCurrentDigest === null
  ) {
    return [invalidPlan("precondition-kind-mismatch", `${path}/expectedCurrentDigest`)];
  }
  return [];
};

const validateChangeOwnership = (
  value: Record<string, unknown>,
  path: string,
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const requiresAifsdOwnership =
    value.change === "update-owned-region" ||
    value.change === "delete" ||
    value.change === "rename";
  if (requiresAifsdOwnership && value.ownership !== "aifsd-owned") {
    diagnostics.push(invalidPlan("ownership-kind-mismatch", `${path}/ownership`));
  }
  if (value.change === "merge" && value.ownership !== "shared") {
    diagnostics.push(invalidPlan("ownership-kind-mismatch", `${path}/ownership`));
  }
  if (
    (value.reasonCode === "user-owned-content-conflict" ||
      value.reasonCode === "user-owned-artifact-absent") &&
    value.ownership !== "user-owned"
  ) {
    diagnostics.push(invalidPlan("ownership-reason-mismatch", `${path}/reasonCode`));
  }
  if (value.reasonCode === "rename-source-not-aifsd-owned" && value.ownership === "aifsd-owned") {
    diagnostics.push(invalidPlan("ownership-reason-mismatch", `${path}/reasonCode`));
  }
  if (value.reasonCode === "rename-destination-occupied" && value.ownership !== "aifsd-owned") {
    diagnostics.push(invalidPlan("ownership-reason-mismatch", `${path}/reasonCode`));
  }
  return diagnostics;
};

const validateRename = (
  value: Record<string, unknown>,
  path: string,
): ConfigurationDiagnostic[] => {
  const isRename = value.change === "rename";
  if (isRename && !isCanonicalWorkspacePath(value.renameTo)) {
    return [invalidPlan("rename-destination-invalid", `${path}/renameTo`)];
  }
  if (!isRename && value.renameTo !== undefined) {
    return [invalidPlan("rename-destination-forbidden", `${path}/renameTo`)];
  }
  return [];
};

const validateContent = (
  value: Record<string, unknown>,
  path: string,
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const contentPresent = Object.hasOwn(value, "content");
  const contentDigestPresent = Object.hasOwn(value, "contentDigest");
  const hasContent = typeof value.content === "string";
  const hasContentDigest = isDigest(value.contentDigest);
  const contentRequired = typeof value.change === "string" && CONTENT_REQUIRED.has(value.change);
  const contentForbidden = value.change === "delete";
  if (contentRequired && (!hasContent || !hasContentDigest)) {
    diagnostics.push(invalidPlan("content-required", path));
  }
  if (contentForbidden && (contentPresent || contentDigestPresent)) {
    diagnostics.push(invalidPlan("content-forbidden", path));
  }
  if (
    !contentRequired &&
    !contentForbidden &&
    (contentPresent !== contentDigestPresent ||
      (contentPresent && (!hasContent || !hasContentDigest)))
  ) {
    diagnostics.push(invalidPlan("content-pair-invalid", path));
  }
  if (
    hasContent &&
    hasContentDigest &&
    !digestsEqual(contentDigest(value.content), value.contentDigest as Digest)
  ) {
    diagnostics.push(invalidPlan("content-digest-mismatch", `${path}/contentDigest`));
  }
  return diagnostics;
};

const validateChange = (value: unknown, index: number): ConfigurationDiagnostic[] => {
  const path = `/plan/changes/${index}`;
  if (!isObjectRecord(value)) {
    return [invalidPlan("expected-object", path)];
  }
  return [
    ...validateChangeShape(value, path),
    ...validateChangePrecondition(value, path),
    ...validateChangeOwnership(value, path),
    ...validateRename(value, path),
    ...validateContent(value, path),
  ];
};

const validatePlanPaths = (changes: readonly unknown[]): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const sources = new Set<string>();
  const destinations = new Set<string>();
  changes.forEach((change, index) => {
    if (!isObjectRecord(change) || typeof change.path !== "string") {
      return;
    }
    if (sources.has(change.path)) {
      diagnostics.push(invalidPlan("source-path-duplicated", `/plan/changes/${index}/path`));
    }
    sources.add(change.path);
    if (change.change === "rename" && typeof change.renameTo === "string") {
      if (destinations.has(change.renameTo)) {
        diagnostics.push(
          invalidPlan("rename-destination-duplicated", `/plan/changes/${index}/renameTo`),
        );
      }
      destinations.add(change.renameTo);
    }
  });
  changes.forEach((change, index) => {
    if (
      isObjectRecord(change) &&
      change.change === "rename" &&
      typeof change.renameTo === "string" &&
      sources.has(change.renameTo)
    ) {
      diagnostics.push(
        invalidPlan("rename-destination-collision", `/plan/changes/${index}/renameTo`),
      );
    }
  });
  return diagnostics;
};

const validatePlan = (rawPlan: ChangePlan): ConfigurationResult<ChangePlan> => {
  const snapshot = captureConfigurationData(rawPlan, "/plan");
  if (!snapshot.ok) {
    return snapshot;
  }
  const value = snapshot.value;
  if (!isObjectRecord(value)) {
    return {
      ok: false,
      diagnostics: [invalidPlan("expected-object", "/plan")],
    };
  }
  const diagnostics = unexpectedFieldDiagnostics(value, PLAN_KEYS, {
    path: "/plan",
    code: "stale-plan",
  });
  if (!isDigest(value.lockDigest)) {
    diagnostics.push(invalidPlan("expected-digest", "/plan/lockDigest"));
  }
  if (!isDigest(value.planDigest)) {
    diagnostics.push(invalidPlan("expected-digest", "/plan/planDigest"));
  }
  if (!Array.isArray(value.changes)) {
    diagnostics.push(invalidPlan("expected-array", "/plan/changes"));
  } else {
    value.changes.forEach((change, index) => diagnostics.push(...validateChange(change, index)));
    diagnostics.push(...validatePlanPaths(value.changes));
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value: freezeConfigurationData(value as unknown as ChangePlan) };
};

/** Verify a single observed digest against its plan precondition. */
const preconditionHolds = (change: PlannedChange, observed: Digest | null): boolean => {
  const expected = change.expectedCurrentDigest;
  if (expected === undefined) {
    return false;
  }
  return expected === null
    ? observed === null
    : observed !== null && digestsEqual(observed, expected);
};

// A rename's destination must be strictly absent at apply preflight. Planning
// proved it absent; any occupant means the workspace drifted since planning, so
// the plan is stale and no write runs — AIFSD never clobbers a destination.
const destinationIsAbsent = (observed: Digest | null): boolean => observed === null;

interface Observation {
  readonly change: PlannedChange;
  readonly kind: "source" | "destination";
  readonly path: string;
}

/** Observation targets for a change: its own path, plus a rename's destination. */
const observationsFor = (change: PlannedChange): Observation[] => {
  const targets: Observation[] = [{ change, kind: "source", path: change.path }];
  if (change.change === "rename" && change.renameTo !== undefined) {
    targets.push({ change, kind: "destination", path: change.renameTo });
  }
  return targets;
};

interface AppliedCollections {
  readonly actionable: readonly PlannedChange[];
  readonly statuses: readonly string[];
  readonly skipped: readonly PlannedChange[];
  readonly conflicts: readonly PlannedChange[];
}

const collect = ({
  actionable,
  statuses,
  skipped,
  conflicts,
}: AppliedCollections): ConfigurationResult<ApplyResult> => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const clone = (change: PlannedChange): PlannedChange => ({ ...change });
  const applied: PlannedChange[] = [];
  const appliedSkipped: PlannedChange[] = skipped.map(clone);
  const appliedConflicts: PlannedChange[] = conflicts.map(clone);
  actionable.forEach((change, index) => {
    const status = statuses[index];
    if (status === "applied") {
      applied.push(clone(change));
    } else if (status === "skipped") {
      appliedSkipped.push(clone(change));
    } else if (status === "conflict") {
      appliedConflicts.push(clone(change));
    } else {
      diagnostics.push(diagnostic("ownership-conflict", "change-status-invalid", change.path));
    }
  });
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    value: freezeConfigurationData({
      applied,
      skipped: appliedSkipped,
      conflicts: appliedConflicts,
    }),
  };
};

/**
 * Apply changes in plan order. The fold deliberately creates the next apply
 * only after the preceding MaybePromise has settled, while retaining a plain
 * array for an entirely synchronous workspace.
 */
const applySequentially = (
  changes: readonly PlannedChange[],
  writer: ArtifactWriter,
): MaybePromise<ChangeApplicationStatus[]> => {
  let statuses: MaybePromise<ChangeApplicationStatus[]> = [];
  for (const change of changes) {
    statuses = maybeThen(statuses, (collected) =>
      maybeThen(writer.apply(change), (status) => [...collected, status]),
    ) as MaybePromise<ChangeApplicationStatus[]>;
  }
  return statuses;
};

/** Apply a classified plan, failing closed on lock drift or a stale precondition. */
export const applyPlan = (
  rawPlan: ChangePlan,
  dependencies: ApplyDependencies,
): MaybePromise<ConfigurationResult<ApplyResult>> => {
  const { approvedPlanDigest, writer, lock } = dependencies;
  const validated = validatePlan(rawPlan);
  if (!validated.ok) {
    return validated;
  }
  const plan = validated.value;

  const previewDigest = contentDigest({ lockDigest: plan.lockDigest, changes: plan.changes });
  if (
    !isDigest(approvedPlanDigest) ||
    !digestsEqual(previewDigest, plan.planDigest) ||
    !digestsEqual(previewDigest, approvedPlanDigest)
  ) {
    return stalePlan("plan-preview-mismatch");
  }

  // Fail closed unless the plan was produced from exactly this approved lock.
  let lockDigest: Digest;
  try {
    lockDigest = contentDigest(lock);
  } catch {
    return stalePlan("approved-lock-not-portable");
  }
  if (!digestsEqual(lockDigest, plan.lockDigest)) {
    return stalePlan("plan-lock-mismatch");
  }

  const skipped: PlannedChange[] = [];
  const conflicts: PlannedChange[] = [];
  const actionable: PlannedChange[] = [];
  for (const change of plan.changes) {
    if (change.change === "unchanged") {
      skipped.push(change);
    } else if (change.change === "conflict" || change.ownership === "user-owned") {
      conflicts.push(change);
    } else {
      actionable.push(change);
    }
  }

  // Full preflight: observe every actionable or previously unchanged artifact
  // (plus both endpoints of a rename) before any apply runs. A file that was
  // unchanged at preview cannot drift and still be reported as safely skipped.
  const preflightChanges = plan.changes.filter(
    (change) =>
      change.change === "unchanged" ||
      (change.change !== "conflict" && change.ownership !== "user-owned"),
  );
  const requests = preflightChanges.flatMap(observationsFor);
  const observations = requests.map((request) => writer.observe(request.path));
  // The nested maybeThen yields MaybePromise<MaybePromise<Result>>, which the
  // type system does not flatten though native promises do; the cast restores
  // the single-layer contract without changing runtime behavior.
  return maybeThen(
    maybeAll(observations),
    (observed): MaybePromise<ConfigurationResult<ApplyResult>> => {
      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index]!;
        const digest = observed[index] as Digest | null;
        const holds =
          request.kind === "source"
            ? preconditionHolds(request.change, digest)
            : destinationIsAbsent(digest);
        if (!holds) {
          return stalePlan("plan-precondition-stale", request.path);
        }
      }
      return maybeThen(applySequentially(actionable, writer), (statuses) =>
        collect({ actionable, statuses, skipped, conflicts }),
      );
    },
  ) as MaybePromise<ConfigurationResult<ApplyResult>>;
};
