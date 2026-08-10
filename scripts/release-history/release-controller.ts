import { createHash, X509Certificate } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { npmDistTag, validateReleaseVersion } from "../release-version";
import {
  readRequiredReleasePlan,
  validateReleaseReceipt,
  type PackageKey,
} from "../release-provenance";
import type { ArtifactMetadata } from "./prepare-artifact";

interface PackageConfig {
  readonly directory: string;
  readonly name: string;
  readonly tagPrefix: string;
}

interface RegistryMetadata {
  readonly version?: unknown;
  readonly gitHead?: unknown;
  readonly dist?: {
    readonly integrity?: unknown;
    readonly tarball?: unknown;
    readonly attestations?: { readonly url?: unknown };
  };
}

interface ProvenanceAttestation {
  readonly predicateType?: unknown;
  readonly bundle?: {
    readonly dsseEnvelope?: { readonly payload?: unknown };
    readonly verificationMaterial?: {
      readonly certificate?: { readonly rawBytes?: unknown };
      readonly x509CertificateChain?: {
        readonly certificates?: readonly { readonly rawBytes?: unknown }[];
      };
    };
  };
}

interface ControllerArguments {
  readonly phase: "validate" | "publish" | "receipt";
  readonly packageKey: PackageKey;
  readonly tag: string;
  readonly tarball?: string;
  readonly metadata?: string;
  readonly receiptOutput?: string;
}

interface RegistryVerificationInput {
  readonly metadata: RegistryMetadata;
  readonly artifact: ArtifactMetadata;
  readonly releaseSha: string;
  readonly download?: (url: string) => Promise<Buffer>;
}

interface PublicationInput {
  readonly root: string;
  readonly key: PackageKey;
  readonly tarball: string;
  readonly artifact: ArtifactMetadata;
}

interface ReceiptInput extends PublicationInput {
  readonly tag: string;
  readonly output: string;
}

const packageConfigs: Readonly<Record<PackageKey, PackageConfig>> = {
  aifsd: {
    directory: "packages/aifsd",
    name: "@aifsd/sdk",
    tagPrefix: "aifsd-v",
  },
  "llm-core": {
    directory: "packages/llm-core",
    name: "@aifsd/llm-core",
    tagPrefix: "v",
  },
  "strict-json": {
    directory: "packages/strict-json",
    name: "@aifsd/strict-json",
    tagPrefix: "strict-json-v",
  },
};

const sha256 = (value: string | Buffer): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const command = (arguments_: readonly string[], cwd: string): string => {
  const result = Bun.spawnSync([...arguments_], { cwd, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() || result.stdout.toString() || arguments_.join(" "));
  }
  return result.stdout.toString().trim();
};

const git = (root: string, ...arguments_: readonly string[]): string =>
  command(["git", ...arguments_], root);

const packageVersion = (root: string, key: PackageKey): string => {
  const manifest = JSON.parse(
    readFileSync(join(root, packageConfigs[key].directory, "package.json"), "utf8"),
  ) as { readonly version?: unknown };
  if (typeof manifest.version !== "string") throw new TypeError("Package version is missing");
  return manifest.version;
};

const planStrings = (value: unknown, name: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${name} must be a string array`);
  }
  return value;
};

const planRecord = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const approvedReleaseMetadataPath = (key: PackageKey, version: string, path: string): boolean => {
  const packageRoot = packageConfigs[key].directory;
  return (
    path === "bun.lock" ||
    path === `${packageRoot}/package.json` ||
    path === `${packageRoot}/CHANGELOG.md` ||
    path === "docs/reference/release-history.md" ||
    path === `${packageRoot}/releases/${version}/plan.json` ||
    path.startsWith(`${packageRoot}/changes/released/${version}/`)
  );
};

const validateGitIdentity = (
  root: string,
  tag: string,
  plan: Readonly<Record<string, unknown>>,
): string => {
  const releaseSha = git(root, "rev-parse", "HEAD");
  const releaseTree = git(root, "rev-parse", "HEAD^{tree}");
  if (git(root, "rev-parse", `${tag}^{commit}`) !== releaseSha) {
    throw new Error(`${tag} must target the checked-out release commit`);
  }
  if (plan.releaseSha !== "SELF" && plan.releaseSha !== releaseSha) {
    throw new Error("Release plan releaseSha must resolve to the checked-out commit");
  }
  if (plan.releaseTree !== "SELF" && plan.releaseTree !== releaseTree) {
    throw new Error("Release plan releaseTree must resolve to the checked-out tree");
  }
  if (git(root, "rev-parse", `${String(plan.sourceSha)}^{tree}`) !== plan.sourceTree) {
    throw new Error("Release plan sourceTree does not match sourceSha");
  }
  command(["git", "merge-base", "--is-ancestor", String(plan.sourceSha), releaseSha], root);
  return releaseSha;
};

const validateMetadataDiff = ({
  root,
  key,
  version,
  plan,
  releaseSha,
}: {
  readonly root: string;
  readonly key: PackageKey;
  readonly version: string;
  readonly plan: Readonly<Record<string, unknown>>;
  readonly releaseSha: string;
}): void => {
  const changed = git(root, "diff", "--name-only", String(plan.sourceSha), releaseSha)
    .split("\n")
    .filter(Boolean)
    .sort();
  const approved = [...planStrings(plan.approvedMetadataPaths, "approvedMetadataPaths")].sort();
  if (approved.some((path) => !approvedReleaseMetadataPath(key, version, path))) {
    throw new Error("Release plan approves a non-metadata path");
  }
  if (JSON.stringify(changed) !== JSON.stringify(approved)) {
    throw new Error("Release commit diff must exactly equal approvedMetadataPaths");
  }
};

const validateFragmentBlobs = (
  root: string,
  plan: Readonly<Record<string, unknown>>,
  releaseSha: string,
): void => {
  if (!Array.isArray(plan.fragments)) throw new TypeError("fragments must be an array");
  for (const fragment of plan.fragments) {
    const record = planRecord(fragment, "fragment");
    const path = String(record.path);
    if (git(root, "rev-parse", `${releaseSha}:${path}`) !== record.blob) {
      throw new Error(`${path} blob does not match the release commit`);
    }
  }
};

const validateSupportDeclarations = (
  root: string,
  plan: Readonly<Record<string, unknown>>,
): void => {
  const registry = JSON.parse(
    readFileSync(join(root, "scripts/release-qualifiers.json"), "utf8"),
  ) as { readonly requiredSurfaces?: unknown };
  const declarations = Array.isArray(plan.supportDeclarations)
    ? plan.supportDeclarations.map((entry) =>
        String(planRecord(entry, "support declaration").surface),
      )
    : [];
  const required = planStrings(registry.requiredSurfaces, "requiredSurfaces");
  if (JSON.stringify([...declarations].sort()) !== JSON.stringify([...required].sort())) {
    throw new Error("Release plan support declarations must match the qualifier registry");
  }
};

const validatePlanInputs = (
  root: string,
  key: PackageKey,
  plan: Readonly<Record<string, unknown>>,
): void => {
  const config = packageConfigs[key];
  const digests = planRecord(plan.digests, "digests");
  const packageManifestBytes = readFileSync(join(root, config.directory, "package.json"));
  const manifest = JSON.parse(packageManifestBytes.toString()) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  if (digests.manifest !== sha256(packageManifestBytes))
    throw new Error("Manifest digest mismatch");
  if (digests.lockfile !== sha256(readFileSync(join(root, "bun.lock")))) {
    throw new Error("Lockfile digest mismatch");
  }
  const qualifier =
    key === "llm-core"
      ? "scripts/release-qualifiers.json"
      : key === "aifsd"
        ? "packages/aifsd/scripts/smoke-package.mjs"
        : undefined;
  if (qualifier && digests.qualifierRegistry !== sha256(readFileSync(join(root, qualifier)))) {
    throw new Error("Qualifier registry digest mismatch");
  }
  if (JSON.stringify(plan.dependencies) !== JSON.stringify(manifest.dependencies ?? {})) {
    throw new Error("Release plan dependencies must exactly match the package manifest");
  }
  const toolchain = planRecord(plan.toolchain, "toolchain");
  if (toolchain.bun !== readFileSync(join(root, ".bun-version"), "utf8").trim()) {
    throw new Error("Release plan Bun version must match .bun-version");
  }
  if (String(toolchain.node) !== "22") throw new Error("Release plan Node version must be 22");
  if (key === "llm-core") validateSupportDeclarations(root, plan);
  if (
    key === "aifsd" &&
    JSON.stringify(
      (Array.isArray(plan.supportDeclarations) ? plan.supportDeclarations : [])
        .map((entry) => String(planRecord(entry, "support declaration").surface))
        .sort(),
    ) !== JSON.stringify(["./config", "./integrations"])
  ) {
    throw new Error("AIFSD support declarations must exactly cover ./config and ./integrations");
  }
};

const validateNoPendingFragments = (root: string, key: PackageKey): void => {
  const pendingDirectory = join(root, packageConfigs[key].directory, "changes/pending");
  if (
    existsSync(pendingDirectory) &&
    command(["find", pendingDirectory, "-type", "f", "-name", "*.json", "-print"], root)
  ) {
    throw new Error("Release plan requires all pending change fragments to be archived");
  }
};

export const validatePlanAgainstGit = (
  root: string,
  key: PackageKey,
  tag: string,
): Readonly<Record<string, unknown>> => {
  const version = packageVersion(root, key);
  const plan = readRequiredReleasePlan(root, key, version);
  const releaseSha = validateGitIdentity(root, tag, plan);
  validateMetadataDiff({ root, key, version, plan, releaseSha });
  validateFragmentBlobs(root, plan, releaseSha);
  validatePlanInputs(root, key, plan);
  validateNoPendingFragments(root, key);
  return plan;
};

const registryMetadata = (root: string, coordinate: string): RegistryMetadata | undefined => {
  const result = Bun.spawnSync(
    ["npm", "view", coordinate, "version", "gitHead", "dist", "--json"],
    { cwd: root, stderr: "pipe", stdout: "pipe" },
  );
  return result.exitCode === 0
    ? (JSON.parse(result.stdout.toString()) as RegistryMetadata)
    : undefined;
};

const archiveIntegrity = (archive: Buffer): string =>
  `sha512-${createHash("sha512").update(archive).digest("base64")}`;

const verifyLocalArtifact = (tarball: string, artifact: ArtifactMetadata): void => {
  const archive = readFileSync(tarball);
  const sha512 = `sha512:${createHash("sha512").update(archive).digest("hex")}`;
  if (sha512 !== artifact.sha512 || archiveIntegrity(archive) !== artifact.integrity) {
    throw new Error("Qualified tarball bytes differ from artifact metadata");
  }
};

const validateArtifactIdentity = (
  root: string,
  key: PackageKey,
  artifact: ArtifactMetadata,
): void => {
  if (
    artifact.package !== packageConfigs[key].name ||
    artifact.version !== packageVersion(root, key) ||
    artifact.schemaVersion !== 1
  ) {
    throw new Error("Artifact metadata does not match the selected package and version");
  }
};

export const verifyRegistryArtifact = async ({
  metadata,
  artifact,
  releaseSha,
  download = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Registry tarball download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  },
}: RegistryVerificationInput): Promise<void> => {
  const tarball = metadata.dist?.tarball;
  if (typeof tarball !== "string" || !tarball.startsWith("https://registry.npmjs.org/")) {
    throw new Error("Registry metadata is missing the canonical tarball URL");
  }
  const archive = await download(tarball);
  const sha512 = `sha512:${createHash("sha512").update(archive).digest("hex")}`;
  if (sha512 !== artifact.sha512 || archiveIntegrity(archive) !== artifact.integrity) {
    throw new Error("Published registry bytes differ from the qualified archive");
  }
  if (metadata.dist?.integrity !== artifact.integrity || metadata.gitHead !== releaseSha) {
    throw new Error("Registry integrity or gitHead differs from the release evidence");
  }
};

const waitForRegistry = async (
  root: string,
  coordinate: string,
  attempts = 8,
): Promise<RegistryMetadata> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const metadata = registryMetadata(root, coordinate);
    if (metadata) return metadata;
    if (attempt < attempts) await Bun.sleep(Math.min(1_000 * 2 ** (attempt - 1), 15_000));
  }
  throw new Error(`${coordinate} did not become visible in the npm registry`);
};

const waitForAttestation = async (
  root: string,
  coordinate: string,
  attempts = 8,
): Promise<RegistryMetadata> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const metadata = registryMetadata(root, coordinate);
    if (typeof metadata?.dist?.attestations?.url === "string") return metadata;
    if (attempt < attempts) await Bun.sleep(Math.min(1_000 * 2 ** (attempt - 1), 15_000));
  }
  throw new Error(`${coordinate} npm provenance attestation did not become visible`);
};

const attestationCertificate = (attestation: ProvenanceAttestation): string | undefined => {
  const direct = attestation.bundle?.verificationMaterial?.certificate?.rawBytes;
  if (typeof direct === "string") return direct;
  const chained =
    attestation.bundle?.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;
  return typeof chained === "string" ? chained : undefined;
};

export const verifyProvenanceAttestation = async (
  url: string,
  artifact: ArtifactMetadata,
  download: (url: string) => Promise<unknown> = async (attestationUrl) => {
    const response = await fetch(attestationUrl);
    if (!response.ok) throw new Error(`Attestation download failed: ${response.status}`);
    return response.json();
  },
): Promise<void> => {
  const response = await download(url);
  const attestations = planRecord(response, "attestation response").attestations;
  if (!Array.isArray(attestations)) throw new Error("npm attestation response has no attestations");
  const provenance = attestations.find(
    (entry): entry is ProvenanceAttestation =>
      planRecord(entry, "attestation").predicateType === "https://slsa.dev/provenance/v1",
  );
  const payload = provenance?.bundle?.dsseEnvelope?.payload;
  const certificate = provenance ? attestationCertificate(provenance) : undefined;
  if (typeof payload !== "string" || !certificate) {
    throw new Error("npm provenance bundle is incomplete");
  }
  const statement = JSON.parse(Buffer.from(payload, "base64").toString()) as {
    readonly subject?: readonly { readonly digest?: Readonly<Record<string, unknown>> }[];
  };
  const expectedSha512 = artifact.sha512.slice("sha512:".length);
  if (!statement.subject?.some((subject) => subject.digest?.sha512 === expectedSha512)) {
    throw new Error("npm provenance subject does not match the qualified archive");
  }
  const identity = new X509Certificate(Buffer.from(certificate, "base64")).subjectAltName;
  if (!identity.includes("https://github.com/theGeekist/llm-core/.github/workflows/release.yml@")) {
    throw new Error("npm provenance signer is not the release workflow");
  }
};

const readArtifact = (path: string): ArtifactMetadata =>
  JSON.parse(readFileSync(path, "utf8")) as ArtifactMetadata;

export const reconcileNpmPublication = async ({
  root,
  key,
  tarball,
  artifact,
}: PublicationInput): Promise<RegistryMetadata> => {
  validateArtifactIdentity(root, key, artifact);
  verifyLocalArtifact(tarball, artifact);
  const config = packageConfigs[key];
  const releaseSha = git(root, "rev-parse", "HEAD");
  const coordinate = `${config.name}@${artifact.version}`;
  let metadata = registryMetadata(root, coordinate);
  if (!metadata) {
    command(
      [
        "npm",
        "publish",
        tarball,
        "--access",
        "public",
        "--provenance",
        "--tag",
        npmDistTag(artifact.version),
      ],
      root,
    );
    metadata = await waitForRegistry(root, coordinate);
  }
  await verifyRegistryArtifact({ metadata, artifact, releaseSha });
  return metadata;
};

const githubReleaseUrl = (root: string, tag: string): string => {
  const value = JSON.parse(
    command(["gh", "api", `repos/theGeekist/llm-core/releases/tags/${tag}`], root),
  ) as { readonly html_url?: unknown; readonly tag_name?: unknown };
  if (value.tag_name !== tag || typeof value.html_url !== "string") {
    throw new Error("GitHub release does not match the release tag");
  }
  return value.html_url;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const writeReceipt = async ({ root, key, tag, artifact, output }: ReceiptInput): Promise<void> => {
  const config = packageConfigs[key];
  const version = packageVersion(root, key);
  const plan = readRequiredReleasePlan(root, key, version);
  const releaseSha = git(root, "rev-parse", "HEAD");
  const metadata = await waitForAttestation(root, `${config.name}@${version}`);
  await verifyRegistryArtifact({ metadata, artifact, releaseSha });
  const attestationUrl = metadata.dist?.attestations?.url;
  if (typeof attestationUrl !== "string") throw new Error("npm provenance attestation is absent");
  await verifyProvenanceAttestation(attestationUrl, artifact);
  const receipt = {
    schemaVersion: 1,
    package: config.name,
    version,
    tag,
    sourceSha: plan.sourceSha,
    releaseSha,
    releaseTree: git(root, "rev-parse", "HEAD^{tree}"),
    repository: "theGeekist/llm-core",
    workflow: {
      runId: requiredEnvironment("GITHUB_RUN_ID"),
      attempt: Number(requiredEnvironment("GITHUB_RUN_ATTEMPT")),
      repository: requiredEnvironment("GITHUB_REPOSITORY"),
      ref: requiredEnvironment("GITHUB_REF"),
      sha: requiredEnvironment("GITHUB_SHA"),
    },
    artifact: {
      sha512: artifact.sha512,
      inventory: artifact.inventory,
      filename: basename(artifact.tarball),
    },
    npm: {
      integrity: metadata.dist?.integrity,
      tarball: metadata.dist?.tarball,
      gitHead: metadata.gitHead,
    },
    githubRelease: { url: githubReleaseUrl(root, tag) },
    attestation: {
      identity: "https://github.com/theGeekist/llm-core/.github/workflows/release.yml",
      url: attestationUrl,
    },
    verifiedAt: new Date().toISOString(),
    result: "verified",
  };
  const errors = validateReleaseReceipt(receipt, relative(root, output));
  if (errors.length > 0) throw new Error(errors.join("\n"));
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
};

const valueAfter = (arguments_: readonly string[], name: string): string | undefined => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};

const parseArguments = (arguments_: readonly string[]): ControllerArguments => {
  const phase = valueAfter(arguments_, "--phase");
  const packageKey = valueAfter(arguments_, "--package");
  const tag = valueAfter(arguments_, "--tag");
  if (phase !== "validate" && phase !== "publish" && phase !== "receipt") {
    throw new TypeError("Expected --phase validate, publish or receipt");
  }
  if (packageKey !== "aifsd" && packageKey !== "llm-core" && packageKey !== "strict-json") {
    throw new TypeError("Expected --package aifsd, llm-core or strict-json");
  }
  if (!tag) throw new TypeError("Expected --tag");
  return {
    phase,
    packageKey,
    tag,
    ...(valueAfter(arguments_, "--tarball")
      ? { tarball: valueAfter(arguments_, "--tarball") }
      : {}),
    ...(valueAfter(arguments_, "--metadata")
      ? { metadata: valueAfter(arguments_, "--metadata") }
      : {}),
    ...(valueAfter(arguments_, "--receipt-output")
      ? { receiptOutput: valueAfter(arguments_, "--receipt-output") }
      : {}),
  };
};

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "../..");
    const arguments_ = parseArguments(process.argv.slice(2));
    const version = packageVersion(root, arguments_.packageKey);
    const distTag = npmDistTag(version);
    const versionErrors = validateReleaseVersion(root, {
      packageKey: arguments_.packageKey,
      tag: arguments_.tag,
      distTag,
      allowUnreleased: false,
    });
    if (versionErrors.length > 0) throw new Error(versionErrors.join("\n"));
    validatePlanAgainstGit(root, arguments_.packageKey, arguments_.tag);
    if (arguments_.phase !== "validate") {
      if (!arguments_.tarball || !arguments_.metadata) {
        throw new TypeError("Publish and receipt phases require --tarball and --metadata");
      }
      if (!existsSync(arguments_.tarball)) throw new Error("Qualified tarball is missing");
      const artifact = readArtifact(arguments_.metadata);
      validateArtifactIdentity(root, arguments_.packageKey, artifact);
      if (resolve(arguments_.tarball) !== resolve(artifact.tarball)) {
        throw new Error("Tarball path differs from artifact metadata");
      }
      verifyLocalArtifact(arguments_.tarball, artifact);
      if (arguments_.phase === "publish") {
        await reconcileNpmPublication({
          root,
          key: arguments_.packageKey,
          tarball: arguments_.tarball,
          artifact,
        });
      } else {
        if (!arguments_.receiptOutput)
          throw new TypeError("Receipt phase requires --receipt-output");
        await writeReceipt({
          root,
          key: arguments_.packageKey,
          tag: arguments_.tag,
          tarball: arguments_.tarball,
          artifact,
          output: arguments_.receiptOutput,
        });
      }
    }
    console.log(`${arguments_.packageKey} release ${arguments_.phase} phase passed (${distTag}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
