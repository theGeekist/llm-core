import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateReleaseReceipt } from "../release-provenance-receipt";

type JsonRecord = Readonly<Record<string, unknown>>;

const stableFields = [
  "schemaVersion",
  "package",
  "version",
  "tag",
  "sourceSha",
  "releaseSha",
  "releaseTree",
  "repository",
  "artifact",
  "npm",
  "githubRelease",
  "attestation",
  "result",
] as const;

const stableReceipt = (value: JsonRecord): JsonRecord =>
  Object.fromEntries(stableFields.map((field) => [field, value[field]]));

export const validateReceiptRetry = (existing: unknown, candidate: unknown): void => {
  const existingErrors = validateReleaseReceipt(existing, "existing receipt");
  const candidateErrors = validateReleaseReceipt(candidate, "candidate receipt");
  if (existingErrors.length > 0 || candidateErrors.length > 0) {
    throw new Error([...existingErrors, ...candidateErrors].join("\n"));
  }
  if (
    JSON.stringify(stableReceipt(existing as JsonRecord)) !==
    JSON.stringify(stableReceipt(candidate as JsonRecord))
  ) {
    throw new Error("Existing receipt conflicts with the verified publication");
  }
};

const command = (arguments_: readonly string[]): Buffer => {
  const result = spawnSync(arguments_[0]!, arguments_.slice(1), {
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString() || arguments_.join(" "));
  return result.stdout;
};

const valueAfter = (arguments_: readonly string[], name: string): string | undefined => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};

if (import.meta.main) {
  const tag = valueAfter(process.argv, "--tag");
  const receiptPath = valueAfter(process.argv, "--receipt");
  const repository = process.env.GITHUB_REPOSITORY;
  if (!tag || !receiptPath || !repository)
    throw new Error("Receipt asset arguments are incomplete");
  const candidate = JSON.parse(readFileSync(receiptPath, "utf8")) as JsonRecord;
  const release = JSON.parse(
    command(["gh", "api", `repos/${repository}/releases/tags/${tag}`]).toString(),
  ) as { readonly assets?: readonly { readonly id?: unknown; readonly name?: unknown }[] };
  const name = "release-receipt.json";
  const matches = (release.assets ?? []).filter((asset) => asset.name === name);
  if (matches.length > 1) throw new Error("Publication receipt asset is duplicated");
  if (matches.length === 0) {
    command(["gh", "release", "upload", tag, `${receiptPath}#${name}`]);
  } else {
    const id = matches[0]?.id;
    if (!Number.isSafeInteger(id)) throw new Error("Publication receipt asset ID is invalid");
    const existing = JSON.parse(
      command([
        "gh",
        "api",
        "-H",
        "Accept: application/octet-stream",
        `repos/${repository}/releases/assets/${id}`,
      ]).toString(),
    ) as JsonRecord;
    validateReceiptRetry(existing, candidate);
  }
}
