import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const steps = Object.freeze([
  Object.freeze({ label: "Formatting", command: ["bun", "run", "format:check"] }),
  Object.freeze({ label: "ESLint", command: ["bun", "run", "quality:lint"] }),
  Object.freeze({ label: "GitHub quality policy", command: ["bun", "run", "quality:github"] }),
  Object.freeze({ label: "Public boundaries", command: ["bun", "run", "check:public-boundary"] }),
  Object.freeze({ label: "Contract schemas", command: ["bun", "run", "contracts:schema:check"] }),
  Object.freeze({ label: "Types", command: ["bun", "run", "typecheck"] }),
  Object.freeze({
    label: "Architecture authority",
    command: ["bun", "run", "--cwd", "packages/llm-core", "check:architecture-status"],
  }),
  Object.freeze({ label: "Documentation", command: ["bun", "run", "docs:check"] }),
  Object.freeze({ label: "Source size", command: ["bun", "run", "check:sloc"] }),
  Object.freeze({ label: "Tests and coverage", command: ["bun", "run", "quality:test"] }),
  Object.freeze({ label: "Production build", command: ["bun", "run", "build"] }),
]);

for (const step of steps) {
  console.log(`\n## ${step.label}`);
  const child = Bun.spawn(step.command, { cwd: root, stderr: "inherit", stdout: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

console.log("\nQuality check passed.");
