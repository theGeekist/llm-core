import { appendFileSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const valueAfter = (arguments_, name) => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};

export const resolveReleaseArtifact = (evidenceRoot) => {
  const metadataNames = readdirSync(evidenceRoot).filter((name) => name.endsWith(".artifact.json"));
  if (metadataNames.length !== 1) {
    throw new Error("Release evidence must contain exactly one artifact metadata file");
  }
  const metadata = join(evidenceRoot, metadataNames[0]);
  if (!lstatSync(metadata).isFile()) throw new Error("Artifact metadata must be a regular file");
  const artifact = JSON.parse(readFileSync(metadata, "utf8"));
  if (
    artifact?.schemaVersion !== 1 ||
    typeof artifact.filename !== "string" ||
    artifact.filename !== basename(artifact.filename) ||
    !artifact.filename.endsWith(".tgz")
  ) {
    throw new Error("Artifact metadata contains an invalid archive filename");
  }
  const tarball = join(evidenceRoot, artifact.filename);
  if (!lstatSync(tarball).isFile()) throw new Error("Qualified archive must be a regular file");
  return Object.freeze({ metadata, tarball });
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const evidence = valueAfter(process.argv.slice(2), "--evidence");
  const githubOutput = valueAfter(process.argv.slice(2), "--github-output");
  if (!evidence || !githubOutput) {
    throw new Error("Expected --evidence and --github-output");
  }
  const resolved = resolveReleaseArtifact(evidence);
  appendFileSync(githubOutput, `metadata=${resolved.metadata}\ntarball=${resolved.tarball}\n`);
}
