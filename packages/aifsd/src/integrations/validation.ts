import { snapshot, StrictJsonError } from "@aifsd/strict-json";
import { isDigest, isExternalId } from "@geekist/llm-core/contracts";
import type {
  DependencyMember,
  ExecutableClosure,
  IntegrationDiagnostic,
  IntegrationManifest,
  IntegrationResult,
  OperationClaim,
} from "./contract.js";
import { integrationClosureDigest, sameDigest } from "./content-identity.js";

const manifestKeys = [
  "capabilities",
  "entrypoints",
  "identity",
  "integrationClass",
  "operations",
  "permissions",
  "schemaVersion",
  "secretReferences",
  "settingsSchema",
  "upstreams",
] as const;

const allowedClasses = new Set([
  "development",
  "runtime",
  "specification",
  "delivery",
  "infrastructure",
  "service-connector",
]);
const allowedDispositions = new Set(["supported", "unsupported", "not-applicable"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const strings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && item.length > 0);

const invalid = (reasonCode: string, path?: string): IntegrationResult<never> => ({
  ok: false,
  diagnostics: [{ code: "invalid-manifest", reasonCode, ...(path === undefined ? {} : { path }) }],
});

const validIdentity = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, ["name", "version", "publisher", "license"]) &&
  ["name", "version", "publisher", "license"].every(
    (key) => typeof value[key] === "string" && value[key].length > 0,
  );

const validMember = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, ["id", "version", "digest"]) &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  typeof value.version === "string" &&
  value.version.length > 0 &&
  isDigest(value.digest);

const validClosure = (value: unknown): value is ExecutableClosure => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["root", "representation"]) ||
    !validMember(value.root)
  ) {
    return false;
  }
  const representation = value.representation;
  if (!isRecord(representation) || typeof representation.kind !== "string") return false;
  if (representation.kind === "package-lock") {
    return exactKeys(representation, ["kind", "lockDigest"]) && isDigest(representation.lockDigest);
  }
  if (representation.kind === "bundle") {
    return (
      exactKeys(representation, ["kind", "bundleDigest"]) && isDigest(representation.bundleDigest)
    );
  }
  if (
    representation.kind !== "members" ||
    !exactKeys(representation, ["kind", "members"]) ||
    !Array.isArray(representation.members) ||
    representation.members.length === 0 ||
    !representation.members.every(validMember)
  ) {
    return false;
  }
  const coordinates = representation.members.map((member) => `${member.id}\u0000${member.version}`);
  return new Set(coordinates).size === coordinates.length;
};

const validOperations = (
  value: unknown,
  upstreams: ReadonlyMap<string, string>,
): value is readonly OperationClaim[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (operation) =>
      isRecord(operation) &&
      exactKeys(operation, ["operationId", "disposition", "upstream", "upstreamVersion"]) &&
      typeof operation.operationId === "string" &&
      operation.operationId.length > 0 &&
      typeof operation.disposition === "string" &&
      allowedDispositions.has(operation.disposition) &&
      typeof operation.upstream === "string" &&
      upstreams.get(operation.upstream) === operation.upstreamVersion &&
      typeof operation.upstreamVersion === "string" &&
      operation.upstreamVersion.length > 0,
  );

const validEntrypoints = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, ["metadata", "qualification", "native"]) &&
  typeof value.metadata === "string" &&
  value.metadata.length > 0 &&
  typeof value.qualification === "string" &&
  value.qualification.length > 0 &&
  (value.native === undefined || (typeof value.native === "string" && value.native.length > 0));

const validPermissions = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, ["filesystem", "process", "network", "effects", "secretSlots"]) &&
  ["filesystem", "process", "network", "effects", "secretSlots"].every(
    (key) =>
      Array.isArray(value[key]) &&
      value[key].every((item) => typeof item === "string" && item.length > 0),
  );

const validOptionalMetadata = (value: Record<string, unknown>): boolean => {
  if (value.settingsSchema !== undefined && !isRecord(value.settingsSchema)) return false;
  if (value.secretReferences === undefined) return true;
  return (
    isRecord(value.secretReferences) &&
    Object.values(value.secretReferences).every(
      (reference) =>
        isRecord(reference) &&
        exactKeys(reference, ["secretId"]) &&
        isExternalId(reference.secretId),
    )
  );
};

const validateHeader = (value: Record<string, unknown>): IntegrationDiagnostic | null => {
  if (!exactKeys(value, manifestKeys) || !validIdentity(value.identity)) {
    return { code: "invalid-manifest", reasonCode: "closed-shape-required" };
  }
  if (value.schemaVersion !== "1.0.0") {
    return {
      code: "unsupported-schema-version",
      reasonCode: "supported-version-required",
      path: "/schemaVersion",
    };
  }
  if (typeof value.integrationClass !== "string" || !allowedClasses.has(value.integrationClass)) {
    return {
      code: "invalid-manifest",
      reasonCode: "integration-class-invalid",
      path: "/integrationClass",
    };
  }
  if (
    !strings(value.capabilities) ||
    new Set(value.capabilities).size !== value.capabilities.length
  ) {
    return { code: "invalid-manifest", reasonCode: "capabilities-invalid", path: "/capabilities" };
  }
  return null;
};

type UpstreamCollection =
  | { readonly ok: true; readonly versions: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly diagnostic: IntegrationDiagnostic };

const collectUpstreams = (value: unknown): UpstreamCollection => {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      diagnostic: {
        code: "invalid-manifest",
        reasonCode: "upstreams-required",
        path: "/upstreams",
      },
    };
  }
  const upstreams = new Map<string, string>();
  for (const upstream of value) {
    if (!isRecord(upstream) || !exactKeys(upstream, ["name", "version", "source", "revision"])) {
      return {
        ok: false,
        diagnostic: {
          code: "invalid-manifest",
          reasonCode: "upstream-invalid",
          path: "/upstreams",
        },
      };
    }
    if (
      !["name", "version", "source", "revision"].every(
        (key) => typeof upstream[key] === "string" && upstream[key].length > 0,
      )
    ) {
      return {
        ok: false,
        diagnostic: {
          code: "invalid-manifest",
          reasonCode: "upstream-invalid",
          path: "/upstreams",
        },
      };
    }
    const name = upstream.name as string;
    if (upstreams.has(name)) {
      return {
        ok: false,
        diagnostic: {
          code: "invalid-manifest",
          reasonCode: "upstream-duplicated",
          path: "/upstreams",
        },
      };
    }
    upstreams.set(name, upstream.version as string);
  }
  return { ok: true, versions: upstreams };
};

const validateBody = (
  value: Record<string, unknown>,
  upstreams: ReadonlyMap<string, string>,
): IntegrationDiagnostic | null => {
  if (!validOperations(value.operations, upstreams)) {
    return { code: "invalid-manifest", reasonCode: "operations-invalid", path: "/operations" };
  }
  if (
    new Set(value.operations.map(({ operationId }) => operationId)).size !== value.operations.length
  ) {
    return { code: "invalid-manifest", reasonCode: "operation-duplicated", path: "/operations" };
  }
  if (
    !validEntrypoints(value.entrypoints) ||
    !validPermissions(value.permissions) ||
    !validOptionalMetadata(value)
  ) {
    return { code: "invalid-manifest", reasonCode: "entrypoints-or-permissions-invalid" };
  }
  return null;
};

const validateSnapshot = (value: Record<string, unknown>): IntegrationDiagnostic | null => {
  const header = validateHeader(value);
  if (header !== null) return header;
  const upstreams = collectUpstreams(value.upstreams);
  if (!upstreams.ok) return upstreams.diagnostic;
  return validateBody(value, upstreams.versions);
};

export const validateIntegrationManifest = (
  input: unknown,
): IntegrationResult<IntegrationManifest> => {
  let portable: unknown;
  try {
    portable = snapshot(input);
  } catch (error) {
    const reasonCode = error instanceof StrictJsonError ? error.code : "inspection-failed";
    return { ok: false, diagnostics: [{ code: "non-portable-value", reasonCode }] };
  }
  if (!isRecord(portable)) return invalid("expected-object");
  const diagnostic = validateSnapshot(portable);
  return diagnostic === null
    ? { ok: true, value: portable as unknown as IntegrationManifest }
    : { ok: false, diagnostics: [diagnostic] };
};

export interface IntegrationArtifactBinding {
  readonly rootArtifact: DependencyMember;
  readonly executableClosure: ExecutableClosure;
}

export const validateIntegrationArtifactBinding = (
  input: unknown,
): IntegrationResult<IntegrationArtifactBinding> => {
  let portable: unknown;
  try {
    portable = snapshot(input);
  } catch (error) {
    return invalid(error instanceof StrictJsonError ? error.code : "inspection-failed");
  }
  if (
    !isRecord(portable) ||
    !exactKeys(portable, ["rootArtifact", "executableClosure"]) ||
    !validMember(portable.rootArtifact) ||
    !validClosure(portable.executableClosure)
  ) {
    return invalid("closure-invalid", "/executableClosure");
  }
  const root = portable.rootArtifact as DependencyMember;
  const closure = portable.executableClosure as ExecutableClosure;
  if (
    closure.root.id !== root.id ||
    closure.root.version !== root.version ||
    !sameDigest(closure.root.digest, root.digest) ||
    !isDigest(integrationClosureDigest(closure))
  ) {
    return invalid("root-closure-mismatch", "/rootArtifact");
  }
  return { ok: true, value: portable as unknown as IntegrationArtifactBinding };
};
