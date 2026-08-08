import { compareUtf16CodeUnits } from "#shared/fp";

declare const contractVersionBrand: unique symbol;

export type DigestAlgorithm = "sha-256";

/** @pattern ^[0-9a-f]{64}$ */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named schema type
export type Sha256Hex = string;

export type Digest = {
  algorithm: DigestAlgorithm;
  value: Sha256Hex;
};

/**
 * @pattern ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$
 */
export type ContractVersion = string & {
  readonly [contractVersionBrand]: "ContractVersion";
};

/** @format uri */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named schema type
export type SchemaId = string;

export type SchemaRef = {
  schemaId: SchemaId;
  version: ContractVersion;
  digest: Digest;
};

const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN =
  // eslint-disable-next-line sonarjs/regex-complexity -- canonical SemVer 2.0.0 expression
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const ABSOLUTE_URI_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:[^\s]+$/;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value: Record<string, unknown>, expected: string[]): boolean => {
  const actual = Object.keys(value).sort(compareUtf16CodeUnits);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export const isDigest = (value: unknown): value is Digest => {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["algorithm", "value"])) {
    return false;
  }
  const candidate = value as Partial<Digest>;
  return candidate.algorithm === "sha-256" && SHA_256_PATTERN.test(candidate.value ?? "");
};

export function digest(value: string): Digest {
  if (!SHA_256_PATTERN.test(value)) {
    throw new TypeError("SHA-256 digests must contain 64 lowercase hexadecimal characters.");
  }
  return { algorithm: "sha-256", value };
}

export const isContractVersion = (value: unknown): value is ContractVersion =>
  typeof value === "string" && SEMVER_PATTERN.test(value);

export function contractVersion(value: string): ContractVersion {
  if (!isContractVersion(value)) {
    throw new TypeError("Contract versions must be valid SemVer strings.");
  }
  return value;
}

export const isAbsoluteSchemaId = (value: unknown): value is string =>
  typeof value === "string" &&
  ABSOLUTE_URI_PATTERN.test(value) &&
  !/%(?![0-9a-fA-F]{2})/.test(value);

export const isSchemaRef = (value: unknown): value is SchemaRef => {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["digest", "schemaId", "version"])) {
    return false;
  }
  const candidate = value as Partial<SchemaRef>;
  return (
    isAbsoluteSchemaId(candidate.schemaId) &&
    isContractVersion(candidate.version) &&
    isDigest(candidate.digest)
  );
};

export function schemaRef(input: { schemaId: string; version: string; digest: Digest }): SchemaRef {
  const candidate: SchemaRef = {
    schemaId: input.schemaId,
    version: contractVersion(input.version),
    digest: input.digest,
  };
  if (!isSchemaRef(candidate)) {
    throw new TypeError("Schema references require an absolute schema ID, version, and digest.");
  }
  return candidate;
}
