// Hostile catalog structural validation.
//
// The catalog is untrusted. After the portable snapshot reduces it to plain
// JSON, every field is still structurally validated before any resolver reads
// it, so a malformed digest, trust level, closure or evidence binding is
// rejected as a diagnostic rather than throwing or slipping through.

import { isCanonicalUuid, isDigest, isSchemaRef } from "@geekist/llm-core/contracts";
import type {
  CatalogEntry,
  ConfigurationDiagnostic,
  ConfigurationDiagnosticReasonCode,
} from "./contract.js";
import {
  duplicateDependencyMemberIndexes,
  isTrustLevel,
  resolvedEntryIdentityDigest,
} from "./selection.js";
import { diagnostic, isObjectRecord, unexpectedFieldDiagnostics } from "./diagnostics.js";

const sealed = (value: Record<string, unknown>, allowed: readonly string[], path: string) =>
  unexpectedFieldDiagnostics(value, allowed, path);

const invalid = (
  reasonCode: ConfigurationDiagnosticReasonCode,
  path: string,
): ConfigurationDiagnostic => diagnostic("unverified-integrity", reasonCode, path);

const validateMember = (member: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(member)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics: ConfigurationDiagnostic[] = sealed(member, ["id", "version", "digest"], path);
  if (typeof member.id !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/id`));
  }
  if (typeof member.version !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/version`));
  }
  if (!isDigest(member.digest)) {
    diagnostics.push(invalid("expected-digest", `${path}/digest`));
  }
  return diagnostics;
};

export const validateClosureStructure = (
  closure: unknown,
  path: string,
): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(closure)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics = sealed(closure, ["root", "representation"], path);
  diagnostics.push(...validateMember(closure.root, `${path}/root`));
  const representation = closure.representation;
  if (!isObjectRecord(representation)) {
    diagnostics.push(invalid("expected-object", `${path}/representation`));
    return diagnostics;
  }
  const rpath = `${path}/representation`;
  if (representation.kind === "members") {
    diagnostics.push(...sealed(representation, ["kind", "members"], rpath));
    if (!Array.isArray(representation.members)) {
      diagnostics.push(invalid("expected-array", `${rpath}/members`));
    } else {
      representation.members.forEach((member, index) => {
        diagnostics.push(...validateMember(member, `${rpath}/members/${index}`));
      });
      duplicateDependencyMemberIndexes(representation.members).forEach((index) =>
        diagnostics.push(invalid("closure-members-duplicated", `${rpath}/members/${index}`)),
      );
    }
  } else if (representation.kind === "package-lock") {
    diagnostics.push(...sealed(representation, ["kind", "lockDigest"], rpath));
    if (!isDigest(representation.lockDigest)) {
      diagnostics.push(invalid("expected-digest", `${rpath}/lockDigest`));
    }
  } else if (representation.kind === "bundle") {
    diagnostics.push(...sealed(representation, ["kind", "bundleDigest"], rpath));
    if (!isDigest(representation.bundleDigest)) {
      diagnostics.push(invalid("expected-digest", `${rpath}/bundleDigest`));
    }
  } else {
    diagnostics.push(invalid("invalid-enum-value", `${rpath}/kind`));
  }
  return diagnostics;
};

const EVIDENCE_KINDS = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);

const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const MEDIA_TYPE_PARAMETER = /^\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*")\s*$/;

const isMediaType = (value: string): boolean => {
  const [type, ...parameters] = value.split(";");
  return (
    type !== undefined &&
    MEDIA_TYPE.test(type) &&
    parameters.every((parameter) => MEDIA_TYPE_PARAMETER.test(parameter))
  );
};

const validateEvidenceContent = (content: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(content)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics = sealed(content, ["resourceId", "mediaType", "byteLength", "digest"], path);
  if (!isCanonicalUuid(content.resourceId)) {
    diagnostics.push(invalid("expected-canonical-uuid", `${path}/resourceId`));
  }
  if (typeof content.mediaType !== "string" || !isMediaType(content.mediaType)) {
    diagnostics.push(invalid("expected-media-type", `${path}/mediaType`));
  }
  if (
    typeof content.byteLength !== "number" ||
    !Number.isInteger(content.byteLength) ||
    content.byteLength < 0
  ) {
    diagnostics.push(invalid("expected-non-negative-integer", `${path}/byteLength`));
  }
  if (!isDigest(content.digest)) {
    diagnostics.push(invalid("expected-digest", `${path}/digest`));
  }
  return diagnostics;
};

const validateEvidenceRef = (evidence: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(evidence)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics = sealed(evidence, ["evidenceId", "kind", "content", "schema"], path);
  if (!isCanonicalUuid(evidence.evidenceId)) {
    diagnostics.push(invalid("expected-canonical-uuid", `${path}/evidenceId`));
  }
  if (typeof evidence.kind !== "string" || !EVIDENCE_KINDS.has(evidence.kind)) {
    diagnostics.push(invalid("invalid-enum-value", `${path}/kind`));
  }
  diagnostics.push(...validateEvidenceContent(evidence.content, `${path}/content`));
  if (Object.hasOwn(evidence, "schema") && !isSchemaRef(evidence.schema)) {
    diagnostics.push(invalid("invalid-schema-reference", `${path}/schema`));
  }
  return diagnostics;
};

export const validateEvidenceBinding = (
  binding: unknown,
  path: string,
): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(binding)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics = sealed(binding, ["evidence", "subjectClosureDigest"], path);
  if (!isDigest(binding.subjectClosureDigest)) {
    diagnostics.push(invalid("expected-digest", `${path}/subjectClosureDigest`));
  }
  diagnostics.push(...validateEvidenceRef(binding.evidence, `${path}/evidence`));
  return diagnostics;
};

const validateEntryStructure = (entry: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(entry)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics: ConfigurationDiagnostic[] = sealed(
    entry,
    ["kind", "name", "version", "artifactDigest", "closure", "trust", "evidence", "signature"],
    path,
  );
  if (entry.kind !== "template" && entry.kind !== "integration") {
    diagnostics.push(invalid("invalid-enum-value", `${path}/kind`));
  }
  if (typeof entry.name !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/name`));
  }
  if (typeof entry.version !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/version`));
  }
  if (!isDigest(entry.artifactDigest)) {
    diagnostics.push(invalid("expected-digest", `${path}/artifactDigest`));
  }
  diagnostics.push(...validateClosureStructure(entry.closure, `${path}/closure`));
  if (!isTrustLevel(entry.trust)) {
    diagnostics.push(invalid("invalid-enum-value", `${path}/trust`));
  }
  if (entry.evidence !== undefined) {
    if (!Array.isArray(entry.evidence)) {
      diagnostics.push(invalid("expected-array", `${path}/evidence`));
    } else {
      entry.evidence.forEach((binding, index) =>
        diagnostics.push(...validateEvidenceBinding(binding, `${path}/evidence/${index}`)),
      );
    }
  }
  if (entry.signature !== undefined && typeof entry.signature !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/signature`));
  }
  return diagnostics;
};

const validateAuthorityStructure = (
  authority: unknown,
  path: string,
): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(authority)) {
    return [invalid("expected-object", path)];
  }
  const diagnostics: ConfigurationDiagnostic[] = [];
  if (typeof authority.provenance !== "string") {
    diagnostics.push(invalid("expected-string", `${path}/provenance`));
  }
  if (typeof authority.signature !== "string" || authority.signature.length === 0) {
    diagnostics.push(invalid("expected-non-empty-string", `${path}/signature`));
  }
  for (const key of Object.keys(authority)) {
    if (key !== "provenance" && key !== "signature") {
      diagnostics.push(invalid("unexpected-field", `${path}/${key}`));
    }
  }
  return diagnostics;
};

// Two catalogue entries with byte-identical content are a duplicated coordinate:
// resolution must not silently collapse them, so a repeated entry is rejected.
// Same (kind, name, version) with DIFFERENT content is a separate ambiguity that
// the resolver detects; it is deliberately not treated as a duplicate here.
const duplicateEntryDiagnostics = (
  entries: readonly { readonly entry: CatalogEntry; readonly index: number }[],
): ConfigurationDiagnostic[] => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const seen = new Set<string>();
  entries.forEach(({ entry, index }) => {
    const identity = resolvedEntryIdentityDigest(entry);
    const key = `${identity.algorithm}:${identity.value}`;
    if (seen.has(key)) {
      diagnostics.push(invalid("duplicate-coordinate", `/catalog/entries/${index}`));
    }
    seen.add(key);
  });
  return diagnostics;
};

/** Total structural validation of the hostile-safe catalog snapshot. */
export const validateCatalogStructure = (catalog: unknown): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(catalog)) {
    return [invalid("expected-object", "/catalog")];
  }
  const diagnostics: ConfigurationDiagnostic[] = sealed(
    catalog,
    ["identity", "sequence", "snapshotDigest", "authority", "entries"],
    "/catalog",
  );
  const identity = catalog.identity;
  if (
    !isObjectRecord(identity) ||
    typeof identity.id !== "string" ||
    typeof identity.version !== "string"
  ) {
    diagnostics.push(invalid("expected-object", "/catalog/identity"));
  } else {
    diagnostics.push(...sealed(identity, ["id", "version"], "/catalog/identity"));
  }
  diagnostics.push(...validateAuthorityStructure(catalog.authority, "/catalog/authority"));
  if (
    typeof catalog.sequence !== "number" ||
    !Number.isSafeInteger(catalog.sequence) ||
    catalog.sequence < 0
  ) {
    diagnostics.push(invalid("expected-non-negative-safe-integer", "/catalog/sequence"));
  }
  if (!isDigest(catalog.snapshotDigest)) {
    diagnostics.push(invalid("expected-digest", "/catalog/snapshotDigest"));
  }
  if (!Array.isArray(catalog.entries)) {
    diagnostics.push(invalid("expected-array", "/catalog/entries"));
  } else {
    const validEntries: { entry: CatalogEntry; index: number }[] = [];
    catalog.entries.forEach((entry, index) => {
      const entryDiagnostics = validateEntryStructure(entry, `/catalog/entries/${index}`);
      diagnostics.push(...entryDiagnostics);
      if (entryDiagnostics.length === 0) {
        validEntries.push({ entry: entry as CatalogEntry, index });
      }
    });
    diagnostics.push(...duplicateEntryDiagnostics(validEntries));
  }
  return diagnostics;
};
