import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { isExactSemver, npmDistTag, validateReleaseVersion } from "../release-version";
import { validateReleaseReceipt, type PackageKey } from "../release-provenance";
import type { ArtifactMetadata } from "./prepare-artifact";
import { boundedResponseBytes } from "./bounded-response";
import { assertLiveReleaseAuthority } from "./release-live-authority";
import { inspectProvenanceIdentity } from "./verify-provenance-attestation";

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
    readonly shasum?: unknown;
    readonly tarball?: unknown;
    readonly attestations?: { readonly url?: unknown };
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
  readonly tag: string;
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
    name: "@geekist/llm-core",
    tagPrefix: "v",
  },
  "strict-json": {
    directory: "packages/strict-json",
    name: "@aifsd/strict-json",
    tagPrefix: "strict-json-v",
  },
};

const command = (
  arguments_: readonly string[],
  cwd: string,
  limits: { readonly timeout?: number; readonly maxBuffer?: number } = {},
): string => {
  const result = Bun.spawnSync([...arguments_], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
    timeout: limits.timeout ?? 30_000,
    maxBuffer: limits.maxBuffer ?? 8 * 1024 * 1024,
  });
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

export const validateTaggedReleaseIdentity = (input: {
  readonly version: string;
  readonly tag: string;
  readonly tagPrefix: string;
  readonly head: string;
  readonly workflowSha: string;
}): void => {
  if (!isExactSemver(input.version) || input.tag !== `${input.tagPrefix}${input.version}`) {
    throw new Error("Release tag must exactly match the manifest version");
  }
  if (!/^[0-9a-f]{40}$/.test(input.head) || input.head !== input.workflowSha) {
    throw new Error("Checked-out release commit differs from GITHUB_SHA");
  }
};

const registryMetadata = (root: string, coordinate: string): RegistryMetadata | undefined => {
  const result = Bun.spawnSync(
    ["npm", "view", coordinate, "version", "gitHead", "dist", "--json"],
    {
      cwd: root,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return result.exitCode === 0
    ? (JSON.parse(result.stdout.toString()) as RegistryMetadata)
    : undefined;
};

const registryDistTags = (root: string, packageName: string): Readonly<Record<string, unknown>> =>
  JSON.parse(command(["npm", "view", packageName, "dist-tags", "--json"], root)) as Readonly<
    Record<string, unknown>
  >;

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
    return boundedResponseBytes(url, {
      label: "Registry tarball download",
      limit: 100 * 1024 * 1024,
    });
  },
}: RegistryVerificationInput): Promise<void> => {
  const tarball = metadata.dist?.tarball;
  if (typeof tarball !== "string" || !tarball.startsWith("https://registry.npmjs.org/")) {
    throw new Error("Registry metadata is missing the canonical tarball URL");
  }
  const archive = await download(tarball);
  const sha512 = `sha512:${createHash("sha512").update(archive).digest("hex")}`;
  const shasum = createHash("sha1").update(archive).digest("hex");
  if (sha512 !== artifact.sha512 || archiveIntegrity(archive) !== artifact.integrity) {
    throw new Error("Published registry bytes differ from the qualified archive");
  }
  if (metadata.dist?.integrity !== artifact.integrity) {
    throw new Error("Registry integrity differs from the release evidence");
  }
  if (metadata.dist?.shasum !== shasum) {
    throw new Error("Registry shasum differs from the qualified archive");
  }
  if (metadata.gitHead !== undefined && metadata.gitHead !== releaseSha) {
    throw new Error("Registry gitHead differs from the release evidence");
  }
};

export const verifyRegistryDistTag = (
  tags: Readonly<Record<string, unknown>>,
  distTag: string,
  version: string,
): void => {
  if (tags[distTag] !== version) {
    throw new Error(`Registry dist-tag ${distTag} differs from the release version`);
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

const readArtifact = (path: string): ArtifactMetadata =>
  JSON.parse(readFileSync(path, "utf8")) as ArtifactMetadata;

export const reconcileNpmPublication = async ({
  root,
  key,
  tarball,
  artifact,
  tag,
}: PublicationInput): Promise<RegistryMetadata> => {
  validateArtifactIdentity(root, key, artifact);
  verifyLocalArtifact(tarball, artifact);
  const config = packageConfigs[key];
  const releaseSha = git(root, "rev-parse", "HEAD");
  const coordinate = `${config.name}@${artifact.version}`;
  await assertLiveReleaseAuthority(root, tag);
  let metadata = registryMetadata(root, coordinate);
  if (!metadata) {
    await assertLiveReleaseAuthority(root, tag);
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
      { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 },
    );
    metadata = await waitForRegistry(root, coordinate);
  }
  await verifyRegistryArtifact({ metadata, artifact, releaseSha });
  const distTag = npmDistTag(artifact.version);
  verifyRegistryDistTag(registryDistTags(root, config.name), distTag, artifact.version);
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
  const releaseSha = git(root, "rev-parse", "HEAD");
  const metadata = await waitForAttestation(root, `${config.name}@${version}`);
  await verifyRegistryArtifact({ metadata, artifact, releaseSha });
  const distTag = npmDistTag(version);
  verifyRegistryDistTag(registryDistTags(root, config.name), distTag, version);
  const attestationUrl = metadata.dist?.attestations?.url;
  if (typeof attestationUrl !== "string") throw new Error("npm provenance attestation is absent");
  await inspectProvenanceIdentity(attestationUrl, artifact, { tag });
  const receipt = {
    schemaVersion: 1,
    package: config.name,
    version,
    tag,
    sourceSha: releaseSha,
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
      shasum: metadata.dist?.shasum,
      distTag,
      tarball: metadata.dist?.tarball,
      ...(typeof metadata.gitHead === "string" ? { gitHead: metadata.gitHead } : {}),
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

const validateRelease = async (root: string, arguments_: ControllerArguments): Promise<string> => {
  const version = packageVersion(root, arguments_.packageKey);
  const distTag = npmDistTag(version);
  validateTaggedReleaseIdentity({
    version,
    tag: arguments_.tag,
    tagPrefix: packageConfigs[arguments_.packageKey].tagPrefix,
    head: git(root, "rev-parse", "HEAD"),
    workflowSha: requiredEnvironment("GITHUB_SHA"),
  });
  const versionErrors = validateReleaseVersion(root, {
    packageKey: arguments_.packageKey,
    tag: arguments_.tag,
    distTag,
    allowUnreleased: false,
  });
  if (versionErrors.length > 0) throw new Error(versionErrors.join("\n"));
  await assertLiveReleaseAuthority(root, arguments_.tag);
  return distTag;
};

const qualifiedArtifact = (root: string, arguments_: ControllerArguments): ArtifactMetadata => {
  if (!arguments_.tarball || !arguments_.metadata) {
    throw new TypeError("Publish and receipt phases require --tarball and --metadata");
  }
  if (!existsSync(arguments_.tarball)) throw new Error("Qualified tarball is missing");
  const artifact = readArtifact(arguments_.metadata);
  validateArtifactIdentity(root, arguments_.packageKey, artifact);
  if (
    basename(arguments_.tarball) !== artifact.filename ||
    basename(artifact.tarball) !== artifact.filename
  ) {
    throw new Error("Tarball filename differs from artifact metadata");
  }
  verifyLocalArtifact(arguments_.tarball, artifact);
  return artifact;
};

const executeReleasePhase = async (
  root: string,
  arguments_: ControllerArguments,
): Promise<string> => {
  const distTag = await validateRelease(root, arguments_);
  if (arguments_.phase === "validate") return distTag;
  const artifact = qualifiedArtifact(root, arguments_);
  if (arguments_.phase === "publish") {
    await reconcileNpmPublication({
      root,
      key: arguments_.packageKey,
      tarball: arguments_.tarball!,
      artifact,
      tag: arguments_.tag,
    });
    return distTag;
  }
  if (!arguments_.receiptOutput) throw new TypeError("Receipt phase requires --receipt-output");
  await writeReceipt({
    root,
    key: arguments_.packageKey,
    tag: arguments_.tag,
    tarball: arguments_.tarball!,
    artifact,
    output: arguments_.receiptOutput,
  });
  return distTag;
};

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "../..");
    const arguments_ = parseArguments(process.argv.slice(2));
    const distTag = await executeReleasePhase(root, arguments_);
    console.log(`${arguments_.packageKey} release ${arguments_.phase} phase passed (${distTag}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { inspectProvenanceIdentity };
