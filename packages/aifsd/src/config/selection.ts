// Selection policy over catalogue entries: coordinate matching, trust
// eligibility, deterministic candidate ordering and projection into an exact
// resolved selection. Resolution consumes this policy rather than rebuilding
// candidate pipelines in several modules.

import type {
  Catalog,
  CatalogEntry,
  ExecutableClosure,
  ResolvedSelection,
  Selection,
  TrustLevel,
} from "./contract.js";
import { isExternalId, type SecretRef } from "@aifsd/llm-core/contracts";
import { closureDigest, contentDigest } from "./content-digest.js";
import { diagnostic, isObjectRecord, normalizeConfigurationValue } from "./diagnostics.js";
import type { ConfigurationDiagnostic } from "./contract.js";
import { compareSemVer, parseSemVer, rangeMatcher, type SemVer } from "./version-range.js";

export const isSecretRef = (value: unknown): value is SecretRef => {
  if (!isObjectRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "secretId" && isExternalId(value.secretId);
};

/** Every declared secret slot contains an opaque reference, never a value. */
export const validateSelectionSecrets = (
  record: Readonly<Record<string, unknown>> | undefined,
  path: string,
): ConfigurationDiagnostic[] => {
  if (record === undefined) {
    return [];
  }
  return Object.entries(record)
    .filter(([, value]) => !isSecretRef(value))
    .map(([key]) => diagnostic("raw-secret", "secret-reference-required", `${path}/${key}`));
};

const CREDENTIAL_SUFFIXES = ["password", "secret", "credential", "token"] as const;
const SENSITIVE_KEY_QUALIFIERS = [
  "api",
  "access",
  "application",
  "client",
  "consumer",
  "encryption",
  "private",
  "secret",
  "signing",
] as const;
const SENSITIVE_EXACT_KEYS = [
  "authorization",
  "connectionstring",
  "passphrase",
  "privatekeypem",
] as const;

const isCredentialShapedKey = (key: string): boolean => {
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SENSITIVE_EXACT_KEYS.includes(compact as (typeof SENSITIVE_EXACT_KEYS)[number])) {
    return true;
  }
  if (CREDENTIAL_SUFFIXES.some((suffix) => compact.endsWith(suffix))) {
    return true;
  }
  if (!compact.endsWith("key")) {
    return false;
  }
  const qualifier = compact.slice(0, -"key".length);
  return SENSITIVE_KEY_QUALIFIERS.some((candidate) => qualifier.endsWith(candidate));
};

const scanSetting = (
  value: unknown,
  path: string,
  diagnostics: ConfigurationDiagnostic[],
): void => {
  if (isSecretRef(value)) {
    diagnostics.push(diagnostic("raw-secret", "secret-reference-forbidden", path));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSetting(item, `${path}/${index}`, diagnostics));
    return;
  }
  if (isObjectRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const at = `${path}/${key}`;
      if (isCredentialShapedKey(key)) {
        diagnostics.push(diagnostic("raw-secret", "credential-shaped-setting", at));
      } else {
        scanSetting(nested, at, diagnostics);
      }
    }
    return;
  }
  const normalized = normalizeConfigurationValue(value, path);
  if (!normalized.ok) {
    diagnostics.push(normalized.diagnostic);
  }
};

/** Selection settings are strict JSON and may not smuggle credential material. */
export const validateSelectionSettings = (
  record: Readonly<Record<string, unknown>> | undefined,
  path: string,
): ConfigurationDiagnostic[] => {
  if (record === undefined) {
    return [];
  }
  const diagnostics: ConfigurationDiagnostic[] = [];
  for (const [key, value] of Object.entries(record)) {
    const at = `${path}/${key}`;
    if (isCredentialShapedKey(key)) {
      diagnostics.push(diagnostic("raw-secret", "credential-shaped-setting", at));
    } else {
      scanSetting(value, at, diagnostics);
    }
  }
  return diagnostics;
};

export const entryMatches = (entry: CatalogEntry, selection: Selection): boolean =>
  entry.kind === selection.kind && entry.name === selection.name;

export const selectionCoordinate = (kind: unknown, name: unknown): string =>
  `${String(kind)}:${String(name)}`;

export const toResolvedSelection = (entry: CatalogEntry): ResolvedSelection => ({
  kind: entry.kind,
  name: entry.name,
  version: entry.version,
  artifactDigest: entry.artifactDigest,
  closure: entry.closure,
  closureDigest: closureDigest(entry.closure),
  trust: entry.trust,
  ...(entry.signature === undefined ? {} : { signature: entry.signature }),
  evidence: entry.evidence ?? [],
});

/** Complete semantic release identity with unordered closure members normalised. */
export const resolvedEntryIdentityDigest = (entry: CatalogEntry) => {
  const resolved = toResolvedSelection(entry);
  return contentDigest({
    kind: resolved.kind,
    name: resolved.name,
    version: resolved.version,
    artifactDigest: resolved.artifactDigest,
    closureDigest: resolved.closureDigest,
    trust: resolved.trust,
    ...(resolved.signature === undefined ? {} : { signature: resolved.signature }),
    evidence: resolved.evidence,
  });
};

export const TRUST_LEVELS: readonly TrustLevel[] = ["local", "community", "verified", "official"];

const TRUST_ORDER: Readonly<Record<TrustLevel, number>> = {
  local: 0,
  community: 1,
  verified: 2,
  official: 3,
};

export const isTrustLevel = (value: unknown): value is TrustLevel =>
  typeof value === "string" && TRUST_LEVELS.includes(value as TrustLevel);

export const meetsTrust = (actual: TrustLevel, minimum: TrustLevel): boolean =>
  TRUST_ORDER[actual] >= TRUST_ORDER[minimum];

export interface SelectionCandidate {
  readonly entry: CatalogEntry;
  readonly version: SemVer;
}

/** Catalogue releases matching the requested coordinate and supported range. */
export const matchingSelectionCandidates = (
  selection: Selection,
  catalog: Catalog,
): SelectionCandidate[] => {
  const matcher = rangeMatcher(selection.versionRange);
  if (matcher.kind === "unsupported") {
    return [];
  }
  return catalog.entries
    .filter((entry) => entryMatches(entry, selection))
    .map((entry) => ({ entry, version: parseSemVer(entry.version) }))
    .filter(
      (candidate): candidate is SelectionCandidate =>
        candidate.version !== null && matcher.test(candidate.version),
    );
};

/** Eligible releases in deterministic newest-first order. */
export const orderedSelectionCandidates = (
  selection: Selection,
  catalog: Catalog,
): SelectionCandidate[] =>
  matchingSelectionCandidates(selection, catalog)
    .filter(
      ({ entry }) =>
        selection.trust === undefined || meetsTrust(entry.trust, selection.trust.minimum),
    )
    .sort((left, right) => compareSemVer(right.version, left.version));

export const duplicateDependencyMemberIndexes = (members: readonly unknown[]): number[] => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  members.forEach((member, index) => {
    if (!isObjectRecord(member)) {
      return;
    }
    const key = `${String(member.id)}@${String(member.version)}`;
    if (seen.has(key)) {
      duplicates.push(index);
    }
    seen.add(key);
  });
  return duplicates;
};

export const hasDuplicateMembers = (closure: ExecutableClosure): boolean => {
  if (closure.representation.kind !== "members") {
    return false;
  }
  return duplicateDependencyMemberIndexes(closure.representation.members).length > 0;
};
