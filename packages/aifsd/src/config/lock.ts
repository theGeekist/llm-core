// Reproducibility lock. A lock binds every resolved dependency to its complete
// executable-closure digest and binds each qualification-evidence reference to
// the exact closure it qualifies. Because closure identity covers the whole
// transitive set, mutating any transitive dependency invalidates both the lock
// and its evidence even when the root package is unchanged (ADR-003 §Decision,
// CONFIGURATION.md "Locking and reproducibility").
//
// Closure identity is always RECOMPUTED from the resolved closure here; a
// resolver-supplied closureDigest is never trusted, so a custom or stale port
// cannot smuggle a false identity into the lock. Verification rebuilds the
// expected lock and fails closed on any semantic drift.

import { isDigest, type Digest } from "@aifsd/llm-core/contracts";
import type {
  CatalogAuthority,
  ConfigurationLockInput,
  ConfigurationLock,
  ConfigurationResult,
  ConfigurationDiagnostic,
  ConfigurationDiagnosticReasonCode,
  EvidenceBinding,
  ExecutableClosure,
  LockedDependency,
  ResolvedConfiguration,
  ResolutionDecision,
  ResolvedSelection,
} from "./contract.js";
import { closureDigest, contentDigest, digestsEqual } from "./content-digest.js";
import {
  captureConfigurationData,
  diagnostic,
  freezeConfigurationData,
  isObjectRecord,
  unexpectedFieldDiagnostics,
} from "./diagnostics.js";
import { hasDuplicateMembers, meetsTrust, selectionCoordinate } from "./selection.js";
import { compareSemVer, parseSemVer, rangeMatcher } from "./version-range.js";

const LOCK_KEYS = [
  "schemaVersion",
  "manifestDigest",
  "catalog",
  "catalogSequence",
  "catalogSnapshotDigest",
  "catalogAuthority",
  "generator",
  "dependencies",
  "resolutionDecisions",
  "materializationInputsDigest",
  "target",
] as const;

// ConfigurationLockInput is a hostile boundary: snapshot it FIRST (no caller accessor
// runs), then seal it: exactly { materializationInputsDigest, target?,
// approvedLock? } with a valid digest and a closed { os, arch } target.
const validateLockInput = (
  inputs: Record<string, unknown>,
): { readonly diagnostics: ConfigurationDiagnostic[] } => {
  const diagnostics = unexpectedFieldDiagnostics(
    inputs,
    ["materializationInputsDigest", "target", "approvedLock"],
    "/lockInput",
  );
  if (!isDigest(inputs.materializationInputsDigest)) {
    diagnostics.push(
      diagnostic("non-portable-value", "expected-digest", "/lockInput/materializationInputsDigest"),
    );
  }
  if (inputs.target !== undefined) {
    const target = inputs.target;
    if (!isObjectRecord(target)) {
      diagnostics.push(diagnostic("non-portable-value", "expected-object", "/lockInput/target"));
    } else {
      diagnostics.push(...unexpectedFieldDiagnostics(target, ["os", "arch"], "/lockInput/target"));
      if (typeof target.os !== "string" || typeof target.arch !== "string") {
        diagnostics.push(diagnostic("non-portable-value", "expected-string", "/lockInput/target"));
      }
    }
  }
  return { diagnostics };
};

const optionalDigestEqual = (a: Digest | undefined, b: Digest | undefined): boolean =>
  a === undefined ? b === undefined : b !== undefined && digestsEqual(a, b);

const closureIsComplete = (closure: ExecutableClosure): boolean =>
  closure.representation.kind === "members" ? closure.representation.members.length > 0 : true;

const decisionMatchesSelection = (
  decision: ResolutionDecision,
  selection: ResolvedSelection,
): boolean => {
  const matcher = rangeMatcher(decision.requestedVersionRange);
  const selectedVersion = parseSemVer(decision.selectedVersion);
  const eligibleVersions = decision.eligibleVersions.map(parseSemVer);
  if (
    matcher.kind === "unsupported" ||
    selectedVersion === null ||
    eligibleVersions.length === 0 ||
    eligibleVersions.some((version) => version === null || !matcher.test(version)) ||
    !decision.eligibleVersions.includes(decision.selectedVersion)
  ) {
    return false;
  }
  const parsedEligible = eligibleVersions as Exclude<(typeof eligibleVersions)[number], null>[];
  const descending = parsedEligible.every(
    (version, index) => index === 0 || compareSemVer(parsedEligible[index - 1]!, version) >= 0,
  );
  const selectedIsHighest = compareSemVer(selectedVersion, parsedEligible[0]!) === 0;
  const expectedReason = selectedIsHighest
    ? decision.minimumTrust === undefined
      ? "highest-compatible-release"
      : "highest-compatible-trusted-release"
    : "compatible-release-selected";
  return (
    descending &&
    decision.kind === "selection-resolution" &&
    decision.selectionReasonCode === "manifest-selection" &&
    decision.selectionKind === selection.kind &&
    decision.name === selection.name &&
    decision.selectedVersion === selection.version &&
    decision.selectedTrust === selection.trust &&
    decision.versionReasonCode === expectedReason &&
    (decision.minimumTrust === undefined ||
      meetsTrust(decision.selectedTrust, decision.minimumTrust)) &&
    digestsEqual(decision.artifactDigest, selection.artifactDigest) &&
    digestsEqual(decision.closureDigest, closureDigest(selection.closure))
  );
};

const validateResolutionDecisions = (
  resolved: ResolvedConfiguration,
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const selections = new Map(
    resolved.selections.map((selection) => [
      selectionCoordinate(selection.kind, selection.name),
      selection,
    ]),
  );
  const seen = new Set<string>();
  resolved.resolutionDecisions.forEach((decision, index) => {
    const key = selectionCoordinate(decision.selectionKind, decision.name);
    const selection = selections.get(key);
    if (
      seen.has(key) ||
      selection === undefined ||
      !decisionMatchesSelection(decision, selection)
    ) {
      diagnostics.push(
        diagnostic(
          "unverified-integrity",
          "resolution-decision-mismatch",
          `/resolutionDecisions/${index}`,
        ),
      );
    }
    seen.add(key);
  });
  if (seen.size !== selections.size || resolved.resolutionDecisions.length !== selections.size) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolution-decision-mismatch", "/resolutionDecisions"),
    );
  }
  return diagnostics;
};

// Evidence is already bound to its closure at resolution time; the lock copies
// each binding VERBATIM and never re-mints the subject closure digest.
const bindEvidence = (selection: ResolvedSelection): readonly EvidenceBinding[] =>
  selection.evidence.map((binding) => ({ ...binding }));

const toLockedDependency = (selection: ResolvedSelection): LockedDependency => {
  // Recompute closure identity from the closure itself, never the port value.
  const recomputed = closureDigest(selection.closure);
  return {
    kind: selection.kind,
    name: selection.name,
    version: selection.version,
    artifactDigest: selection.artifactDigest,
    closureDigest: recomputed,
    trust: selection.trust,
    ...(selection.signature === undefined ? {} : { signature: selection.signature }),
    evidence: bindEvidence(selection),
  };
};

/** Build a portable lock from a resolved configuration. */
export const createConfigurationLock = (
  resolved: ResolvedConfiguration,
  rawInputs: ConfigurationLockInput,
): ConfigurationResult<ConfigurationLock> => {
  // Snapshot ConfigurationLockInput BEFORE reading any field so a hostile getter never
  // runs, then seal the plain clone.
  const inputsSnap = captureConfigurationData(rawInputs, "/lockInput");
  if (!inputsSnap.ok) {
    return { ok: false, diagnostics: inputsSnap.diagnostics };
  }
  const safeInputs = inputsSnap.value;
  if (!isObjectRecord(safeInputs)) {
    return {
      ok: false,
      diagnostics: [diagnostic("non-portable-value", "expected-object", "/lockInput")],
    };
  }
  const inputsValidation = validateLockInput(safeInputs);
  if (inputsValidation.diagnostics.length > 0) {
    return { ok: false, diagnostics: inputsValidation.diagnostics };
  }
  const inputs = safeInputs as unknown as ConfigurationLockInput;

  const diagnostics: ConfigurationDiagnostic[] = [];
  for (const selection of resolved.selections) {
    if (!closureIsComplete(selection.closure)) {
      diagnostics.push(
        diagnostic("closure-incomplete", "closure-incomplete", `/selections/${selection.name}`),
      );
    }
    if (hasDuplicateMembers(selection.closure)) {
      diagnostics.push(
        diagnostic(
          "unverified-integrity",
          "closure-members-duplicated",
          `/selections/${selection.name}/closure/representation`,
        ),
      );
    }
  }
  diagnostics.push(...validateResolutionDecisions(resolved));
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const value: ConfigurationLock = {
    schemaVersion: resolved.manifestVersion,
    manifestDigest: resolved.manifestDigest,
    catalog: resolved.catalog,
    catalogSequence: resolved.catalogSequence,
    catalogSnapshotDigest: resolved.catalogSnapshotDigest,
    catalogAuthority: resolved.catalogAuthority,
    generator: resolved.generator,
    dependencies: resolved.selections.map(toLockedDependency),
    resolutionDecisions: resolved.resolutionDecisions,
    materializationInputsDigest: inputs.materializationInputsDigest,
    ...(inputs.target === undefined ? {} : { target: inputs.target }),
  };
  // Clone so the lock retains no handle into the resolved configuration, then
  // deep-freeze so later mutation of `resolved` cannot alter the lock.
  const rebuilt = freezeConfigurationData(structuredClone(value)) as ConfigurationLock;

  // Regeneration-respects-lock: when an approved lock is supplied it is a
  // hostile boundary. Rebuild from the current resolution and fail closed on
  // ANY drift from the approved artifact, never throwing.
  if (inputs.approvedLock !== undefined) {
    const drift = verifyAgainstApproved(rebuilt, inputs.approvedLock);
    if (drift.length > 0) {
      return { ok: false, diagnostics: drift };
    }
  }
  return { ok: true, value: rebuilt };
};

/**
 * Compare an untrusted approved lock against the freshly rebuilt lock. The
 * approved lock is snapshotted first (no caller accessor runs) and every guard
 * is total, so a malformed or hostile approved lock yields diagnostics rather
 * than an exception.
 */
const verifyAgainstApproved = (
  rebuilt: ConfigurationLock,
  approvedRaw: ConfigurationLock,
): ConfigurationDiagnostic[] => {
  const snap = captureConfigurationData(approvedRaw, "/approvedLock");
  if (!snap.ok) {
    return [...snap.diagnostics];
  }
  const approved = snap.value;
  if (!isObjectRecord(approved) || !Array.isArray(approved.dependencies)) {
    return [diagnostic("lock-invalidated", "approved-lock-malformed", "/approvedLock")];
  }
  const sealing = unexpectedFieldDiagnostics(approved, LOCK_KEYS, {
    path: "/approvedLock",
    code: "lock-invalidated",
  });
  if (sealing.length > 0) {
    return sealing;
  }
  const duplicate = duplicateDependencyDiagnostics(approved.dependencies);
  if (duplicate.length > 0) {
    return duplicate;
  }
  try {
    const existing = approved as unknown as ConfigurationLock;
    const diagnostics = [
      ...compareIdentity(existing, rebuilt),
      ...compareAuthority(existing, rebuilt),
      ...compareDependencies(existing, rebuilt),
    ];
    if (!digestsEqual(contentDigest(approved), contentDigest(rebuilt))) {
      if (diagnostics.length === 0) {
        diagnostics.push(diagnostic("lock-invalidated", "approved-lock-mismatch", "/approvedLock"));
      }
    }
    return diagnostics;
  } catch {
    return [diagnostic("lock-invalidated", "approved-lock-malformed", "/approvedLock")];
  }
};

// An approved lock keyed on (kind, name) must not list the same dependency
// twice: the duplicate would be silently deduplicated by the comparison map and
// hide a tampered artifact, so a repeated coordinate is rejected outright.
const duplicateDependencyDiagnostics = (
  dependencies: readonly unknown[],
): ConfigurationDiagnostic[] => {
  const seen = new Set<string>();
  const diagnostics: ConfigurationDiagnostic[] = [];
  dependencies.forEach((dep, index) => {
    if (!isObjectRecord(dep)) {
      return;
    }
    const key = selectionCoordinate(dep.kind, dep.name);
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          "lock-invalidated",
          "dependency-duplicated",
          `/approvedLock/dependencies/${index}`,
        ),
      );
    }
    seen.add(key);
  });
  return diagnostics;
};

const compareAuthority = (
  existing: ConfigurationLock,
  expected: ConfigurationLock,
): ConfigurationDiagnostic[] => {
  const a: Partial<CatalogAuthority> = existing.catalogAuthority ?? {};
  const b = expected.catalogAuthority;
  if (a.provenance !== b.provenance || a.signature !== b.signature) {
    return [diagnostic("lock-invalidated", "catalog-authority-drift", "/catalogAuthority")];
  }
  return [];
};

const compareIdentity = (
  existing: ConfigurationLock,
  expected: ConfigurationLock,
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const invalidate = (reasonCode: ConfigurationDiagnosticReasonCode, path: string): void => {
    diagnostics.push(diagnostic("lock-invalidated", reasonCode, path));
  };
  if (existing.schemaVersion !== expected.schemaVersion) {
    invalidate("schema-version-drift", "/schemaVersion");
  }
  if (!digestsEqual(existing.manifestDigest, expected.manifestDigest)) {
    invalidate("manifest-digest-drift", "/manifestDigest");
  }
  if (
    existing.catalog.id !== expected.catalog.id ||
    existing.catalog.version !== expected.catalog.version
  ) {
    invalidate("catalog-identity-drift", "/catalog");
  }
  if (existing.catalogSequence !== expected.catalogSequence) {
    invalidate("catalog-sequence-drift", "/catalogSequence");
  }
  if (!digestsEqual(existing.catalogSnapshotDigest, expected.catalogSnapshotDigest)) {
    invalidate("catalog-snapshot-drift", "/catalogSnapshotDigest");
  }
  if (
    existing.generator.id !== expected.generator.id ||
    existing.generator.version !== expected.generator.version ||
    !digestsEqual(existing.generator.artifactDigest, expected.generator.artifactDigest)
  ) {
    invalidate("generator-drift", "/generator");
  }
  if (
    !digestsEqual(
      contentDigest(existing.resolutionDecisions),
      contentDigest(expected.resolutionDecisions),
    )
  ) {
    invalidate("resolution-decisions-drift", "/resolutionDecisions");
  }
  if (!digestsEqual(existing.materializationInputsDigest, expected.materializationInputsDigest)) {
    invalidate("materialization-inputs-drift", "/materializationInputsDigest");
  }
  if (!optionalDigestEqual(targetDigest(existing), targetDigest(expected))) {
    invalidate("target-platform-drift", "/target");
  }
  return diagnostics;
};

const targetDigest = (lockValue: ConfigurationLock): Digest | undefined =>
  lockValue.target === undefined ? undefined : contentDigest(lockValue.target);

const compareDependencies = (
  existing: ConfigurationLock,
  expected: ConfigurationLock,
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const expectedByKey = new Map(
    expected.dependencies.map((dep) => [selectionCoordinate(dep.kind, dep.name), dep]),
  );
  const existingByKey = new Map(
    existing.dependencies.map((dep) => [selectionCoordinate(dep.kind, dep.name), dep]),
  );

  for (const dep of existing.dependencies) {
    const key = selectionCoordinate(dep.kind, dep.name);
    const match = expectedByKey.get(key);
    const path = `/dependencies/${dep.name}`;
    if (!match) {
      diagnostics.push(diagnostic("lock-invalidated", "dependency-missing", path));
      continue;
    }
    if (
      dep.version !== match.version ||
      dep.trust !== match.trust ||
      dep.signature !== match.signature ||
      !digestsEqual(dep.artifactDigest, match.artifactDigest) ||
      !digestsEqual(dep.closureDigest, match.closureDigest)
    ) {
      diagnostics.push(diagnostic("lock-invalidated", "dependency-identity-drift", path));
      continue;
    }
    if (!digestsEqual(contentDigest(dep.evidence), contentDigest(match.evidence))) {
      diagnostics.push(
        diagnostic("evidence-subject-mismatch", "evidence-binding-drift", `${path}/evidence`),
      );
    }
  }

  for (const dep of expected.dependencies) {
    if (!existingByKey.has(selectionCoordinate(dep.kind, dep.name))) {
      diagnostics.push(
        diagnostic("lock-invalidated", "dependency-added", `/dependencies/${dep.name}`),
      );
    }
  }
  return diagnostics;
};

/**
 * Verify a lock still describes the current resolution. Rebuilds the expected
 * lock from `resolved` + `inputs` and deep-compares, so it fails closed on any
 * semantic drift: added/removed dependencies, catalog identity or snapshot,
 * generator identity or artifact, resolved version or artifact, closure digest,
 * target, materialization inputs, manifest digest, and evidence set/subject.
 */
export const verifyLock = (
  existing: ConfigurationLock,
  resolved: ResolvedConfiguration,
  inputs: ConfigurationLockInput,
): ConfigurationResult<void> => {
  const rebuilt = createConfigurationLock(resolved, inputs);
  if (!rebuilt.ok) {
    return rebuilt;
  }
  const diagnostics = [
    ...compareIdentity(existing, rebuilt.value),
    ...compareAuthority(existing, rebuilt.value),
    ...compareDependencies(existing, rebuilt.value),
  ];
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, value: undefined };
};
