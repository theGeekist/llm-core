type JsonRecord = Readonly<Record<string, unknown>>;

const receiptKeys = new Set([
  "schemaVersion",
  "package",
  "version",
  "tag",
  "sourceSha",
  "releaseSha",
  "releaseTree",
  "repository",
  "workflow",
  "artifact",
  "npm",
  "githubRelease",
  "attestation",
  "verifiedAt",
  "result",
]);
const workflowKeys = new Set(["runId", "attempt", "repository", "ref", "sha"]);
const artifactKeys = new Set(["sha512", "inventory", "filename"]);
const npmKeys = new Set(["integrity", "shasum", "distTag", "tarball", "gitHead"]);
const githubReleaseKeys = new Set(["url"]);
const attestationKeys = new Set(["identity", "url"]);
const packageTags = new Map([
  ["@aifsd/sdk", "aifsd-v"],
  ["@geekist/llm-core", "v"],
  ["@aifsd/strict-json", "strict-json-v"],
]);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0;
const exactKeys = (value: JsonRecord, allowed: ReadonlySet<string>, path: string): string[] =>
  Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path} contains unknown key ${key}`);
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const exactSemver = (value: unknown): value is string =>
  typeof value === "string" && isExactSemver(value);
const digest = (value: unknown, algorithm: "sha256" | "sha512"): boolean =>
  typeof value === "string" &&
  new RegExp(`^${algorithm}:[0-9a-f]{${algorithm === "sha256" ? 64 : 128}}$`).test(value);
const httpsUrl = (value: unknown, hosts?: ReadonlySet<string>): value is string => {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && (!hosts || hosts.has(parsed.hostname));
  } catch {
    return false;
  }
};

const validateWorkflow = (value: unknown, receipt: JsonRecord, path: string): string[] => {
  if (!isRecord(value)) return [`${path}.workflow must contain a runId`];
  const errors = exactKeys(value, workflowKeys, `${path}.workflow`);
  if (
    !nonEmptyString(value.runId) ||
    !Number.isInteger(value.attempt) ||
    Number(value.attempt) < 1 ||
    value.repository !== "theGeekist/llm-core" ||
    value.ref !== `refs/tags/${String(receipt.tag)}` ||
    value.sha !== receipt.releaseSha
  ) {
    errors.push(`${path}.workflow must bind run, attempt, repository, tag ref and release SHA`);
  }
  return errors;
};

const validateArtifact = (value: unknown, path: string): string[] => {
  if (!isRecord(value)) return [`${path}.artifact must contain archive and inventory digests`];
  const errors = exactKeys(value, artifactKeys, `${path}.artifact`);
  if (
    !digest(value.sha512, "sha512") ||
    !digest(value.inventory, "sha256") ||
    !nonEmptyString(value.filename)
  ) {
    errors.push(`${path}.artifact must contain exact archive and inventory digests and filename`);
  }
  return errors;
};

const validateNpm = ({
  value,
  releaseSha,
  receiptVersion,
  path,
}: Readonly<{
  value: unknown;
  releaseSha: unknown;
  receiptVersion: unknown;
  path: string;
}>): string[] => {
  if (!isRecord(value)) return [`${path}.npm must contain integrity and tarball evidence`];
  const errors = exactKeys(value, npmKeys, `${path}.npm`);
  const expectedDistTag =
    typeof receiptVersion === "string" && isExactSemver(receiptVersion)
      ? npmDistTag(receiptVersion)
      : undefined;
  if (
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(String(value.integrity)) ||
    !/^[0-9a-f]{40}$/.test(String(value.shasum)) ||
    expectedDistTag === undefined ||
    value.distTag !== expectedDistTag ||
    !httpsUrl(value.tarball, new Set(["registry.npmjs.org"]))
  ) {
    errors.push(`${path}.npm must contain exact integrity, shasum, dist-tag and registry tarball`);
  }
  if (value.gitHead !== undefined && (!sha(value.gitHead) || value.gitHead !== releaseSha)) {
    errors.push(`${path}.npm.gitHead must equal releaseSha when the registry provides it`);
  }
  return errors;
};

const validateGithubRelease = (value: unknown, path: string): string[] => {
  if (!isRecord(value)) return [`${path}.githubRelease must contain a URL`];
  const errors = exactKeys(value, githubReleaseKeys, `${path}.githubRelease`);
  if (!httpsUrl(value.url, new Set(["github.com"]))) {
    errors.push(`${path}.githubRelease must contain a GitHub HTTPS URL`);
  }
  return errors;
};

const validateAttestation = (value: unknown, path: string): string[] => {
  if (!isRecord(value)) return [`${path}.attestation must contain an identity`];
  const errors = exactKeys(value, attestationKeys, `${path}.attestation`);
  if (
    value.identity !== "https://github.com/theGeekist/llm-core/.github/workflows/release.yml" ||
    !httpsUrl(value.url)
  ) {
    errors.push(`${path}.attestation must bind the release workflow identity and URL`);
  }
  return errors;
};

export const validateReleaseReceipt = (value: unknown, path = "receipt"): string[] => {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors = exactKeys(value, receiptKeys, path);
  const tagPrefix = packageTags.get(String(value.package));
  if (value.schemaVersion !== 1) errors.push(`${path}.schemaVersion must be 1`);
  if (!tagPrefix) errors.push(`${path}.package is unsupported`);
  if (!exactSemver(value.version)) errors.push(`${path}.version must be exact semantic version`);
  if (!tagPrefix || !exactSemver(value.version) || value.tag !== `${tagPrefix}${value.version}`) {
    errors.push(`${path}.tag must exactly match package and version`);
  }
  for (const key of ["sourceSha", "releaseSha", "releaseTree"] as const) {
    if (!sha(value[key])) errors.push(`${path}.${key} must be a full Git SHA`);
  }
  if (value.repository !== "theGeekist/llm-core") {
    errors.push(`${path}.repository must be theGeekist/llm-core`);
  }
  errors.push(...validateWorkflow(value.workflow, value, path));
  errors.push(...validateArtifact(value.artifact, path));
  errors.push(
    ...validateNpm({
      value: value.npm,
      releaseSha: value.releaseSha,
      receiptVersion: value.version,
      path,
    }),
  );
  errors.push(...validateGithubRelease(value.githubRelease, path));
  errors.push(...validateAttestation(value.attestation, path));
  if (
    typeof value.verifiedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.verifiedAt) ||
    Number.isNaN(Date.parse(value.verifiedAt))
  ) {
    errors.push(`${path}.verifiedAt must be a UTC RFC 3339 timestamp`);
  }
  if (value.result !== "verified") errors.push(`${path}.result must be verified`);
  return errors;
};
import { isExactSemver, npmDistTag } from "./release-version";
