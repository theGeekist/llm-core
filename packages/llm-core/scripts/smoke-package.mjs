import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(root, "../..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspacePackageJson = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8"));
const expectedSubpaths = [
  ".",
  "./contracts",
  "./model",
  "./model/runtime",
  "./tools",
  "./tools/runtime",
  "./control",
  "./control/runtime",
  "./evidence",
  "./state",
  "./context",
  "./artifacts",
  "./evaluation",
  "./agent",
  "./agent/runtime",
  "./workflow",
  "./workflow/runtime",
  "./conversation",
  "./interaction",
  "./retrieval",
  "./indexing",
  "./storage",
  "./memory",
  "./media",
  "./adapters/ai-sdk",
  "./adapters/ai-sdk-ui",
  "./adapters/assistant-ui",
  "./adapters/openai-chatkit",
  "./adapters/nlux-ui",
];
const expectedPeerDependencies = {
  "@ai-sdk/provider": "^4.0.3",
  "@assistant-ui/react": "^0.11.53",
  "@nlux/core": "^2.17.1",
  "@openai/chatkit": "^1.2.0",
  ai: "^7.0.37",
};
const externalConsumerTypeDependencies = {
  "@types/json-schema": "^7.0.15",
  "@types/node": "^22.13.5",
};

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    fail(`${command} ${args.join(" ")} failed.`);
  }
  return result.stdout ?? "";
};

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const containsSourceAlias = (source) => source.includes('"#') || source.includes("'#");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  fail(`Package smoke requires Node.js >=22; received ${process.versions.node}.`);
}
if (workspacePackageJson.engines?.node !== ">=22" || packageJson.engines?.node !== ">=22") {
  fail('Workspace and package must declare Node.js ">=22".');
}
if (
  packageJson.version !== "2.0.0" ||
  packageJson.type !== "module" ||
  packageJson.main !== "./dist/esm/index.js" ||
  packageJson.module !== "./dist/esm/index.js"
) {
  fail("Package must publish the v2 ESM-only manifest.");
}
if (JSON.stringify(Object.keys(packageJson.exports)) !== JSON.stringify(expectedSubpaths)) {
  fail("Package exports must match the exact ordered ADR-008 surface.");
}
if (
  JSON.stringify(packageJson.peerDependencies) !== JSON.stringify(expectedPeerDependencies) ||
  Object.keys(expectedPeerDependencies).some(
    (name) => packageJson.peerDependenciesMeta?.[name]?.optional !== true,
  ) ||
  Object.keys(packageJson.peerDependenciesMeta ?? {}).some(
    (name) => !Object.hasOwn(expectedPeerDependencies, name),
  )
) {
  fail("Package peers must match the optional qualified-adapter dependency surface.");
}

const runtimeTargets = new Set();
const typeTargets = new Set();
for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
  if (
    typeof conditions !== "object" ||
    conditions === null ||
    Array.isArray(conditions) ||
    Object.hasOwn(conditions, "browser") ||
    Object.hasOwn(conditions, "require") ||
    conditions.import !== conditions.default
  ) {
    fail(`Export ${subpath} must use types/import/default ESM conditions only.`);
  }
  const conditionKeys = Object.keys(conditions);
  if (conditionKeys.join(",") !== "types,import,default") {
    fail(`Export ${subpath} has unexpected conditions: ${conditionKeys.join(",")}.`);
  }
  if (
    !conditions.import.startsWith("./dist/esm/") ||
    !conditions.import.endsWith(".js") ||
    !conditions.types.startsWith("./dist/types/") ||
    !conditions.types.endsWith(".d.ts")
  ) {
    fail(`Export ${subpath} has an invalid runtime or declaration target.`);
  }
  runtimeTargets.add(conditions.import);
  typeTargets.add(conditions.types);
}

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/\bcjs\b|commonjs/i.test(`${name} ${command}`)) {
    fail(`CommonJS build script remains: ${name}`);
  }
}

const staleCjsArtifacts = [join(root, "dist", "cjs", "stale.cjs"), join(root, "dist", "stale.cjs")];
for (const artifact of staleCjsArtifacts) {
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, "module.exports = {};\n");
}
run("bun", ["run", "build"], { cwd: root });

for (const artifact of staleCjsArtifacts) {
  if (existsSync(artifact)) fail(`Build retained ${relative(root, artifact)}.`);
}
for (const target of [...runtimeTargets, ...typeTargets]) {
  if (!existsSync(join(root, target))) fail(`Missing manifest target: ${target}`);
}
for (const file of walkFiles(join(root, "dist"))) {
  const path = relative(root, file);
  if (path.split(sep).includes("cjs") || file.endsWith(".cjs")) {
    fail(`CommonJS artifact remains: ${path}`);
  }
  if (file.endsWith(".js") && containsSourceAlias(readFileSync(file, "utf8"))) {
    fail(`Built JavaScript retains a source-only alias: ${path}`);
  }
  if (file.endsWith(".d.ts") && containsSourceAlias(readFileSync(file, "utf8"))) {
    fail(`Declaration retains a source-only alias: ${path}`);
  }
}

const smokeRoot = mkdtempSync(join(tmpdir(), "llm-core-package-smoke-"));
try {
  const packedOutput = run("npm", ["pack", "--json", "--pack-destination", smokeRoot], {
    cwd: root,
    env: { ...process.env, npm_config_cache: join(smokeRoot, "npm-cache") },
  });
  const packed = JSON.parse(packedOutput);
  const tarball = join(smokeRoot, packed[0].filename);
  const consumer = join(smokeRoot, "consumer");
  mkdirSync(consumer, { recursive: true });
  const peerDependencies = Object.fromEntries(
    Object.entries(packageJson.peerDependencies ?? {}).map(([name, range]) => [name, range]),
  );
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "llm-core-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@geekist/llm-core": `file:${tarball}`,
          ...peerDependencies,
        },
        devDependencies: externalConsumerTypeDependencies,
      },
      null,
      2,
    ),
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], {
    cwd: consumer,
    env: { ...process.env, npm_config_cache: join(smokeRoot, "npm-cache") },
  });

  const specifiers = expectedSubpaths.map((subpath) =>
    subpath === "." ? "@geekist/llm-core" : `@geekist/llm-core/${subpath.slice(2)}`,
  );
  const runtimeImports = specifiers
    .map((specifier) => `await import(${JSON.stringify(specifier)});`)
    .join("\n");
  writeFileSync(join(consumer, "runtime.mjs"), `${runtimeImports}\n`);
  run(process.execPath, ["runtime.mjs"], { cwd: consumer });

  writeFileSync(
    join(consumer, "consumer.ts"),
    [
      'import { createAgent, createConversation, defineTool, defineWorkflow } from "@geekist/llm-core";',
      'import type { Agent, AgentConfig, AgentEvent, AgentResult, AgentRun, Conversation, ConversationConfig, ConversationEvent, ConversationResult, ConversationRun, Tool, ToolCall, ToolConfig, ToolExecutionFailure, ToolExecutionResult, Workflow, WorkflowConfig, WorkflowPause, WorkflowResult, WorkflowStep, WorkflowStepResult } from "@geekist/llm-core";',
      'import { createLocalAgentRunner, createCapabilityBindingCatalog } from "@geekist/llm-core/agent/runtime";',
      'import type { AgentDefinition, PreparedAgentDefinition, AgentRunner, AgentRunnerProfile, AgentStartRequest } from "@geekist/llm-core/agent/runtime";',
      'import { createExecutableTool } from "@geekist/llm-core/tools/runtime";',
      'import type { ExecutableTool, ToolDefinition } from "@geekist/llm-core/tools/runtime";',
      'import { executeControlledTool } from "@geekist/llm-core/tools/runtime";',
      'import type { ExecuteControlledToolInput, ControlledToolExecutionOutcome } from "@geekist/llm-core/tools/runtime";',
      'import type { ConversationStore, ConversationSnapshot, InteractionSession, InteractionSessionIdentityPort } from "@geekist/llm-core/interaction";',
      'import type { ResumeInterventionWorkflowInput, ControlledWorkflowResult } from "@geekist/llm-core/workflow/runtime";',
      'import { createContextEntry, selectContext } from "@geekist/llm-core/context";',
      'import type { ContextEntry, ContextSelection } from "@geekist/llm-core/context";',
      'import { createArtifact, createArtifactRef } from "@geekist/llm-core/artifacts";',
      'import type { Artifact, ArtifactRef } from "@geekist/llm-core/artifacts";',
      'import { createEvaluationCase, createEvaluationComposition, evaluationEvaluatorId } from "@geekist/llm-core/evaluation";',
      'import type { EvaluationCase, EvaluationComposition, EvaluationResult } from "@geekist/llm-core/evaluation";',
      'import type { AiSdkUiProjectionChunk } from "@geekist/llm-core/adapters/ai-sdk-ui";',
      'import type { AssistantUiProjectionCommand, AssistantUiProjectionOptions } from "@geekist/llm-core/adapters/assistant-ui";',
      'import type { ChatKitProjectionEvent } from "@geekist/llm-core/adapters/openai-chatkit";',
      'import type { NluxInteractionAdapterOptions, NluxProjectionSignal } from "@geekist/llm-core/adapters/nlux-ui";',
      ...specifiers
        .slice(1)
        .map(
          (specifier, index) => `import * as surface${index} from ${JSON.stringify(specifier)};`,
        ),
      "void createAgent; void createConversation; void defineTool; void defineWorkflow;",
      "void createLocalAgentRunner; void createCapabilityBindingCatalog; void createExecutableTool;",
      "void executeControlledTool;",
      "void createContextEntry; void selectContext;",
      "void createArtifact; void createArtifactRef;",
      "void createEvaluationCase; void createEvaluationComposition; void evaluationEvaluatorId;",
      "type RootTypes = [Agent, AgentConfig, AgentRun, AgentEvent, AgentResult, Tool, ToolConfig, ToolCall, ToolExecutionResult, ToolExecutionFailure, Workflow<unknown, unknown>, WorkflowConfig<unknown, unknown>, WorkflowStep<unknown, unknown, unknown>, WorkflowStepResult<unknown, unknown>, WorkflowResult<unknown, unknown>, WorkflowPause<unknown, unknown>, Conversation, ConversationConfig, ConversationRun, ConversationEvent, ConversationResult];",
      "declare const rootTypes: RootTypes; void rootTypes;",
      "type AgentRuntimeTypes = [AgentDefinition, PreparedAgentDefinition, AgentRunner, AgentRunnerProfile, AgentStartRequest, ExecutableTool, ToolDefinition];",
      "declare const agentRuntimeTypes: AgentRuntimeTypes; void agentRuntimeTypes;",
      "type ControlTypes = [ExecuteControlledToolInput, ControlledToolExecutionOutcome];",
      "declare const controlTypes: ControlTypes; void controlTypes;",
      "type InteractionTypes = [ConversationStore, ConversationSnapshot, InteractionSession, InteractionSessionIdentityPort];",
      "declare const interactionTypes: InteractionTypes; void interactionTypes;",
      "type WorkflowTypes = [ResumeInterventionWorkflowInput, ControlledWorkflowResult];",
      "declare const workflowTypes: WorkflowTypes; void workflowTypes;",
      "type ContextArtifactTypes = [ContextEntry, ContextSelection, Artifact, ArtifactRef];",
      "declare const contextArtifactTypes: ContextArtifactTypes; void contextArtifactTypes;",
      "type EvaluationTypes = [EvaluationCase, EvaluationComposition, EvaluationResult];",
      "declare const evaluationTypes: EvaluationTypes; void evaluationTypes;",
      "type UiTypes = [AiSdkUiProjectionChunk, AssistantUiProjectionCommand, AssistantUiProjectionOptions, ChatKitProjectionEvent, NluxInteractionAdapterOptions, NluxProjectionSignal];",
      "declare const uiTypes: UiTypes; void uiTypes;",
      ...specifiers.slice(1).map((_, index) => `void surface${index};`),
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "Bundler",
          skipLibCheck: false,
          types: ["node"],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );
  run(resolve(workspaceRoot, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumer,
  });
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}

console.log(
  "Verified 29 ESM-only language-rollout exports from an isolated packed runtime and declaration consumer.",
);
