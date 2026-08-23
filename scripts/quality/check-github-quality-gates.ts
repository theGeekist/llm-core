import { readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateActionReferences,
  validateCiWorkflow,
  validateQualityGateConfiguration,
  type QualityGateConfiguration,
} from "./github-quality-policy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowsRoot = resolve(root, ".github/workflows");
const workflowPaths = readdirSync(workflowsRoot)
  .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
  .map((path) => resolve(workflowsRoot, path))
  .sort((left, right) => left.localeCompare(right));
const workflows = await Promise.all(
  workflowPaths.map(async (path) => ({ path, text: await Bun.file(path).text() })),
);
const configuration = (await Bun.file(
  resolve(root, ".github/quality-gates.json"),
).json()) as QualityGateConfiguration;
const workflowText = workflows.map(({ text }) => text).join("\n");
const ciWorkflow = await Bun.file(resolve(workflowsRoot, "ci.yml")).text();
const errors = [
  ...workflows.flatMap(({ path, text }) => validateActionReferences(relative(root, path), text)),
  ...validateQualityGateConfiguration(configuration, workflowText),
  ...validateCiWorkflow(ciWorkflow),
];

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${workflows.length} workflow(s), immutable action references and ${configuration.requiredChecks.length} required check(s).`,
  );
}
