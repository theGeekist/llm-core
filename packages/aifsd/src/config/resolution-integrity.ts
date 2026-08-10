// Trust checks on a resolved selection: ambiguity detection over the catalog,
// self-consistency of any resolved selection (default or custom resolver), and
// byte-for-byte correspondence of an untrusted custom resolver's output to a
// single real catalog entry.

import { isDigest } from "@aifsd/llm-core/contracts";
import type {
  Catalog,
  ConfigurationDiagnostic,
  ConfigurationDiagnosticReasonCode,
  ResolvedSelection,
  Selection,
} from "./contract.js";
import { closureDigest, contentDigest, digestsEqual } from "./content-digest.js";
import { compareSemVer, parseSemVer, rangeMatcher } from "./version-range.js";
import {
  hasDuplicateMembers,
  isTrustLevel,
  meetsTrust,
  orderedSelectionCandidates,
  resolvedEntryIdentityDigest,
} from "./selection.js";
import { isObjectRecord, diagnostic, unexpectedFieldDiagnostics } from "./diagnostics.js";
import { validateClosureStructure, validateEvidenceBinding } from "./catalog.js";

// A resolver's output may omit or malform any field. This guard runs BEFORE any
// digest is recomputed, so a missing closure or digest yields a diagnostic
// rather than throwing when validation reaches into it.
const requireResolvedShape = (resolved: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(resolved)) {
    return [diagnostic("unverified-integrity", "expected-object", path)];
  }
  const diagnostics = unexpectedFieldDiagnostics(
    resolved,
    [
      "kind",
      "name",
      "version",
      "artifactDigest",
      "closure",
      "closureDigest",
      "trust",
      "signature",
      "evidence",
    ],
    path,
  );
  const push = (reasonCode: ConfigurationDiagnosticReasonCode, field = ""): void => {
    diagnostics.push(
      diagnostic("unverified-integrity", reasonCode, field === "" ? path : `${path}/${field}`),
    );
  };
  if (resolved.kind !== "template" && resolved.kind !== "integration") {
    push("invalid-enum-value", "kind");
  }
  if (typeof resolved.name !== "string") {
    push("expected-string", "name");
  }
  if (typeof resolved.version !== "string") {
    push("expected-string", "version");
  }
  diagnostics.push(...validateClosureStructure(resolved.closure, `${path}/closure`));
  if (!isDigest(resolved.closureDigest)) {
    push("expected-digest", "closureDigest");
  }
  if (!isDigest(resolved.artifactDigest)) {
    push("expected-digest", "artifactDigest");
  }
  if (!isTrustLevel(resolved.trust)) {
    push("invalid-enum-value", "trust");
  }
  if (Object.hasOwn(resolved, "signature") && typeof resolved.signature !== "string") {
    push("expected-string", "signature");
  }
  if (!Array.isArray(resolved.evidence)) {
    push("expected-array", "evidence");
  } else {
    resolved.evidence.forEach((binding, index) =>
      diagnostics.push(...validateEvidenceBinding(binding, `${path}/evidence/${index}`)),
    );
  }
  return diagnostics;
};

/**
 * Detect an ambiguous selection: two entries tie as the highest satisfying
 * version but publish DIFFERENT content. Resolution must never fall back to
 * catalog input order, so this rejects rather than silently picking one.
 */
export const ambiguousSelectionDiagnostic = (
  selection: Selection,
  catalog: Catalog,
  path: string,
): ConfigurationDiagnostic | null => {
  const candidates = orderedSelectionCandidates(selection, catalog);

  const top = candidates[0];
  if (top === undefined) {
    return null;
  }
  const tied = candidates.filter(
    (candidate) => compareSemVer(candidate.version, top.version) === 0,
  );
  const topIdentity = resolvedEntryIdentityDigest(top.entry);
  const differs = tied.some(
    (candidate) => !digestsEqual(resolvedEntryIdentityDigest(candidate.entry), topIdentity),
  );
  return differs ? diagnostic("ambiguous-selection", "ambiguous-release", path) : null;
};

/**
 * Validate a resolved selection before trusting it — this covers both the
 * default resolver and any custom SelectionResolver. Closure identity is recomputed
 * from the closure itself, the artifact must equal the closure root, trust must
 * meet the selection minimum, and every evidence subject must bind to the
 * recomputed closure digest.
 */
export const validateResolvedSelection = (
  resolved: ResolvedSelection,
  selection: Selection,
  path: string,
): ConfigurationDiagnostic[] => {
  const shape = requireResolvedShape(resolved, path);
  if (shape.length > 0) {
    return shape;
  }
  const diagnostics: ConfigurationDiagnostic[] = [];
  // A resolver must answer the exact request: a substitution of a different
  // (kind, name), or a version outside the requested range, is not a valid
  // resolution of this selection even if the returned object is self-consistent.
  if (resolved.kind !== selection.kind || resolved.name !== selection.name) {
    diagnostics.push(diagnostic("unverified-integrity", "resolver-coordinate-mismatch", path));
  }
  const resolvedVersion = parseSemVer(resolved.version);
  const matcher = rangeMatcher(selection.versionRange);
  if (resolvedVersion === null || matcher.kind !== "ok" || !matcher.test(resolvedVersion)) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolved-version-out-of-range", `${path}/version`),
    );
  }
  const recomputed = closureDigest(resolved.closure);
  if (hasDuplicateMembers(resolved.closure)) {
    diagnostics.push(
      diagnostic(
        "unverified-integrity",
        "closure-members-duplicated",
        `${path}/closure/representation`,
      ),
    );
  }
  if (!digestsEqual(resolved.closureDigest, recomputed)) {
    diagnostics.push(
      diagnostic("unverified-integrity", "closure-digest-mismatch", `${path}/closureDigest`),
    );
  }
  if (!digestsEqual(resolved.artifactDigest, resolved.closure.root.digest)) {
    diagnostics.push(
      diagnostic("unverified-integrity", "artifact-root-mismatch", `${path}/artifactDigest`),
    );
  }
  if (selection.trust && !meetsTrust(resolved.trust, selection.trust.minimum)) {
    diagnostics.push(diagnostic("unverified-integrity", "trust-below-minimum", `${path}/trust`));
  }
  for (const binding of resolved.evidence) {
    if (!digestsEqual(binding.subjectClosureDigest, recomputed)) {
      diagnostics.push(
        diagnostic("evidence-subject-mismatch", "evidence-subject-mismatch", `${path}/evidence`),
      );
      break;
    }
  }
  return diagnostics;
};

/**
 * A custom SelectionResolver is untrusted. Its returned selection must correspond to
 * EXACTLY ONE real catalog entry sharing the same (kind, name, version), and the
 * returned artifact, complete closure identity and evidence set must match that
 * entry byte-for-byte. This rejects forged same-coordinate metadata that is
 * internally self-consistent but absent from — or divergent from — the catalog.
 */
export const validateCatalogBinding = (
  resolved: ResolvedSelection,
  catalog: Catalog,
  path: string,
): ConfigurationDiagnostic[] => {
  const matches = catalog.entries.filter(
    (entry) =>
      entry.kind === resolved.kind &&
      entry.name === resolved.name &&
      entry.version === resolved.version,
  );
  if (matches.length !== 1) {
    return [diagnostic("unverified-integrity", "catalog-coordinate-not-unique", path)];
  }
  const entry = matches[0]!;
  const diagnostics: ConfigurationDiagnostic[] = [];
  if (!digestsEqual(resolved.artifactDigest, entry.artifactDigest)) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolver-artifact-mismatch", `${path}/artifactDigest`),
    );
  }
  if (!digestsEqual(closureDigest(resolved.closure), closureDigest(entry.closure))) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolver-closure-mismatch", `${path}/closure`),
    );
  }
  if (resolved.trust !== entry.trust) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolver-trust-mismatch", `${path}/trust`),
    );
  }
  if (resolved.signature !== entry.signature) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolver-signature-mismatch", `${path}/signature`),
    );
  }
  if (!digestsEqual(contentDigest(resolved.evidence), contentDigest(entry.evidence ?? []))) {
    diagnostics.push(
      diagnostic("unverified-integrity", "resolver-evidence-mismatch", `${path}/evidence`),
    );
  }
  return diagnostics;
};
