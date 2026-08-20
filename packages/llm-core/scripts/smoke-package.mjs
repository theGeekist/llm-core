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
const strictJsonRoot = resolve(root, "../strict-json");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const strictJsonPackageJson = JSON.parse(
  readFileSync(join(strictJsonRoot, "package.json"), "utf8"),
);
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
  "./conversation",
  "./interaction",
  "./retrieval",
  "./indexing",
  "./storage",
  "./memory",
  "./media",
  "./specifications",
  "./adapters/ai-sdk",
  "./adapters/langchain",
  "./adapters/llamaindex",
  "./adapters/catalogue",
  "./adapters/catalogue/runtime",
  "./adapters/ai-sdk-ui",
  "./adapters/assistant-ui",
  "./adapters/openai-chatkit",
  "./adapters/nlux-ui",
  "./a2a",
  "./mcp",
];
const expectedPeerDependencies = {
  "@a2a-js/sdk": "1.0.0",
  "@ai-sdk/provider": "^4.0.3",
  "@assistant-ui/react": "^0.11.53",
  "@langchain/core": "1.1.8",
  "@llamaindex/core": "0.6.22",
  "@nlux/core": "^2.17.1",
  "@openai/chatkit": "^1.2.0",
  "@modelcontextprotocol/server": "2.0.0",
  ai: "^7.0.37",
};
const externalConsumerTypeDependencies = {
  "@types/json-schema": "^7.0.15",
  "@types/node": "^22.13.5",
};
const prebuilt = process.argv.includes("--prebuilt");
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (index >= 0 && !value) throw new TypeError(`Expected a path after ${name}.`);
  return value ? resolve(process.cwd(), value) : undefined;
};
const suppliedTarball = argumentValue("--tarball");
const suppliedStrictJsonTarball = argumentValue("--strict-json-tarball");
if (suppliedTarball && !suppliedStrictJsonTarball) {
  throw new TypeError("An exact llm-core tarball requires --strict-json-tarball.");
}

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, options = {}) => {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    const elapsed = Date.now() - startedAt;
    const cache = options.env?.npm_config_cache;
    const detail = result.error instanceof Error ? ` ${result.error.message}` : "";
    const cacheDetail = cache ? ` with npm cache ${cache}` : "";
    fail(`${command} ${args.join(" ")} failed after ${elapsed}ms` + `${cacheDetail}.${detail}`);
  }
  return result.stdout ?? "";
};

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const containsSourceAlias = (source) => /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["']#/.test(source);

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
if (
  packageJson.dependencies?.["@aifsd/strict-json"] !== strictJsonPackageJson.version ||
  String(packageJson.dependencies?.["@aifsd/strict-json"]).startsWith("workspace:")
) {
  fail("Published llm-core must depend on the concrete workspace strict-json version.");
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
if (!prebuilt) {
  for (const artifact of staleCjsArtifacts) {
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, "module.exports = {};\n");
  }
  run("bun", ["run", "build"], { cwd: root });
}

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
  if (!prebuilt) run("bun", ["run", "build"], { cwd: strictJsonRoot });
  const strictJsonTarball =
    suppliedStrictJsonTarball ??
    join(
      smokeRoot,
      JSON.parse(
        run("npm", ["pack", "--json", "--pack-destination", smokeRoot], {
          cwd: strictJsonRoot,
          env: { ...process.env, npm_config_cache: join(smokeRoot, "npm-cache") },
        }),
      )[0].filename,
    );
  const tarball =
    suppliedTarball ??
    join(
      smokeRoot,
      JSON.parse(
        run("npm", ["pack", "--json", "--pack-destination", smokeRoot], {
          cwd: root,
          env: { ...process.env, npm_config_cache: join(smokeRoot, "npm-cache") },
        }),
      )[0].filename,
    );
  if (!existsSync(strictJsonTarball)) fail(`Missing strict-json tarball: ${strictJsonTarball}`);
  if (!existsSync(tarball)) fail(`Missing llm-core tarball: ${tarball}`);
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
          "@aifsd/strict-json": `file:${strictJsonTarball}`,
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
    timeout: 10 * 60 * 1000,
    killSignal: "SIGTERM",
  });

  const specifiers = expectedSubpaths.map((subpath) =>
    subpath === "." ? "@geekist/llm-core" : `@geekist/llm-core/${subpath.slice(2)}`,
  );
  const runtimeImports = specifiers
    .map((specifier) => `await import(${JSON.stringify(specifier)});`)
    .join("\n");
  writeFileSync(
    join(consumer, "runtime.mjs"),
    [
      runtimeImports,
      'const { contractVersion, coreId, digest, extensionNamespace } = await import("@geekist/llm-core/contracts");',
      'const { createSpecificationOperation } = await import("@geekist/llm-core/specifications");',
      'const { documentText, textRetrievalQuery } = await import("@geekist/llm-core/retrieval");',
      'const { createLangChainRetriever } = await import("@geekist/llm-core/adapters/langchain");',
      'const { createLlamaIndexRetriever } = await import("@geekist/llm-core/adapters/llamaindex");',
      'const { ADAPTER_CATALOGUE, registerCapabilityCandidate, resolveCapabilityCandidates } = await import("@geekist/llm-core/adapters/catalogue");',
      'const { acquireCapabilityBindings, registerCapabilityAcquisitionFactory } = await import("@geekist/llm-core/adapters/catalogue/runtime");',
      'const { Document: LangChainDocument } = await import("@langchain/core/documents");',
      'const { Document: LlamaIndexDocument } = await import("@llamaindex/core/schema");',
      "createSpecificationOperation({",
      '  operation: "observe-native-source",',
      '  sourceContract: { authority: "packed-smoke", format: { id: extensionNamespace("dev.geekist.packed-smoke"), version: contractVersion("1.0.0") }, revision: "fixture.1" },',
      '  disposition: "supported",',
      '  fixtures: [{ fixtureId: "packed-smoke.fixture", digest: digest("1".repeat(64)) }],',
      "  diagnostics: [],",
      "});",
      'const query = textRetrievalQuery("packed substitution");',
      'const context = { invocationId: "0190bd0c-0000-7000-8000-000000001415" };',
      'const publicRows = ADAPTER_CATALOGUE.filter((entry) => entry.capability.kind === "retriever" && entry.support.qualification === "packed");',
      'const evidenceVersion = contractVersion("1.0.0");',
      'const candidateFor = (row, acquire) => registerCapabilityCandidate({ kind: "retriever", descriptor: { bindingId: row.implementation.bindingId, claims: [{ capabilityId: row.capability.capabilityId, version: evidenceVersion, status: "supported", evidence: { result: "pass", report: { evidenceId: coreId("0190bd0c-0000-4000-8000-000000001416"), kind: "evaluation", content: { resourceId: coreId("0190bd0c-0000-4000-8000-000000001417"), mediaType: "application/json", byteLength: 2, digest: digest("2".repeat(64)) } }, suiteId: row.support.evidenceSuite, suiteVersion: evidenceVersion, observedAt: "2026-08-18T00:00:00.000Z", implementationId: row.implementation.bindingId, implementationVersion: row.implementation.version } }] } }, { verifyEvidence: (proof) => proof.bindingId === row.implementation.bindingId && proof.evidence.suiteId === row.support.evidenceSuite, verifyAcquisitionFactory: (proof) => proof.acquire === acquire });',
      'const acquireFor = async (row, port) => { const acquire = () => ({ port }); const candidate = candidateFor(row, acquire); const plan = resolveCapabilityCandidates({ requirements: [{ kind: "retriever", bindingId: row.implementation.bindingId }], candidates: [candidate] }); const factory = registerCapabilityAcquisitionFactory(candidate, { kind: "retriever", bindingId: row.implementation.bindingId, acquire }); const acquired = await acquireCapabilityBindings(plan, [factory]); return acquired.bindings[0].port; };',
      'const langChainRow = publicRows.find((entry) => entry.ecosystemId === "langchain");',
      'const llamaIndexRow = publicRows.find((entry) => entry.ecosystemId === "llamaindex");',
      'if (!langChainRow || !llamaIndexRow) throw new Error("Packed adapter catalogue does not expose both qualified retriever rows.");',
      'const langChain = await acquireFor(langChainRow, createLangChainRetriever({ invoke: async () => [new LangChainDocument({ pageContent: "qualified-result" })] }));',
      'const llamaIndex = await acquireFor(llamaIndexRow, createLlamaIndexRetriever({ retrieve: async () => [{ node: new LlamaIndexDocument({ text: "qualified-result" }), score: 1 }] }));',
      "const [langChainResult, llamaIndexResult] = await Promise.all([langChain.retrieve({ request: { query }, context }), llamaIndex.retrieve({ request: { query }, context })]);",
      "const portableResults = [langChainResult, llamaIndexResult].map((result) => result.documents.map(documentText));",
      'if (JSON.stringify(portableResults) !== JSON.stringify([["qualified-result"], ["qualified-result"]])) throw new Error("Packed adapter substitution did not preserve the portable retriever result.");',
      'if (!Object.isFrozen(ADAPTER_CATALOGUE) || !ADAPTER_CATALOGUE.some((entry) => entry.ecosystemId === "langchain" && entry.capability.operation === "retrieve" && entry.exposure.status === "public") || !ADAPTER_CATALOGUE.some((entry) => entry.ecosystemId === "llamaindex" && entry.capability.operation === "retrieve" && entry.exposure.status === "public")) throw new Error("Packed adapter catalogue does not expose both qualified retriever rows.");',
      "",
    ].join("\n"),
  );
  run(process.execPath, ["runtime.mjs"], { cwd: consumer });

  writeFileSync(
    join(consumer, "consumer.ts"),
    [
      'import { compileSpecification, defineTool, loadSpecification, reviewSpecification } from "@geekist/llm-core";',
      'import type { AgentDefinition, AgentEvent, AgentResult, CompiledSpecification, ConversationEvent, ConversationSnapshot, ConversationState, ConversationStore, Specification, SpecificationDecision, SpecificationReviewView, Tool, ToolCall, ToolConfig, ToolExecutionFailure, ToolExecutionResult, WorkflowExecutionPlan } from "@geekist/llm-core";',
      'import type { PreparedAgentDefinition, AgentRunner, AgentRunnerProfile, AgentStartRequest } from "@geekist/llm-core/agent/runtime";',
      'import { createExecutableTool } from "@geekist/llm-core/tools/runtime";',
      'import type { ExecutableTool, ToolDefinition } from "@geekist/llm-core/tools/runtime";',
      'import { executeControlledTool } from "@geekist/llm-core/tools/runtime";',
      'import type { ExecuteControlledToolInput, ControlledToolExecutionOutcome } from "@geekist/llm-core/tools/runtime";',
      'import type { InteractionSession, InteractionSessionIdentityPort } from "@geekist/llm-core/interaction";',
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
      'import { createLangChainRetriever } from "@geekist/llm-core/adapters/langchain";',
      'import { createLlamaIndexRetriever } from "@geekist/llm-core/adapters/llamaindex";',
      'import { ADAPTER_CATALOGUE } from "@geekist/llm-core/adapters/catalogue";',
      'import type { AdapterCatalogueEntry, CapabilityCandidateDescriptor } from "@geekist/llm-core/adapters/catalogue";',
      'import { acquireCapabilityBindings, registerCapabilityAcquisitionFactory } from "@geekist/llm-core/adapters/catalogue/runtime";',
      'import type { CapabilityAcquisitionFactory } from "@geekist/llm-core/adapters/catalogue/runtime";',
      'import type { Retriever } from "@geekist/llm-core/retrieval";',
      'import { A2A_PROTOCOL_VERSION, A2A_SDK_VERSION, createA2AClient } from "@geekist/llm-core/a2a";',
      'import type { A2AClient, Transport } from "@geekist/llm-core/a2a";',
      'import { MCP_PROTOCOL_VERSION, MCP_SERVER_SDK_VERSION, createMcpStatelessHost } from "@geekist/llm-core/mcp";',
      'import type { McpStatelessHost, McpStatelessHostDefinition } from "@geekist/llm-core/mcp";',
      'import { createSpecificationOperation } from "@geekist/llm-core/specifications";',
      'import type { SpecificationAdapterSupport, SpecificationDiagnostic, SpecificationDiagnosticImpact, SpecificationDiagnosticSeverity, SpecificationOperation, SpecificationOperationDisposition, SpecificationOperationId, SpecificationOperationMatrix, SpecificationPolicy, SpecificationReviewItem, SpecificationReviewRelationship, SpecificationScopeId, SpecificationSourceContract, SpecificationSourceSnapshot } from "@geekist/llm-core/specifications";',
      ...specifiers
        .slice(1)
        .map(
          (specifier, index) => `import * as surface${index} from ${JSON.stringify(specifier)};`,
        ),
      "void compileSpecification; void defineTool; void loadSpecification; void reviewSpecification;",
      "void createExecutableTool;",
      "void executeControlledTool;",
      "void createContextEntry; void selectContext;",
      "void createArtifact; void createArtifactRef;",
      "void createEvaluationCase; void createEvaluationComposition; void evaluationEvaluatorId;",
      "declare const nativeLangChainRetriever: Parameters<typeof createLangChainRetriever>[0];",
      "declare const nativeLlamaIndexRetriever: Parameters<typeof createLlamaIndexRetriever>[0];",
      "const portableLangChainRetriever: Retriever = createLangChainRetriever(nativeLangChainRetriever);",
      "const portableLlamaIndexRetriever: Retriever = createLlamaIndexRetriever(nativeLlamaIndexRetriever);",
      "void portableLangChainRetriever; void portableLlamaIndexRetriever;",
      "const catalogueEntries: readonly AdapterCatalogueEntry[] = ADAPTER_CATALOGUE; void catalogueEntries;",
      'declare const candidateDescriptor: CapabilityCandidateDescriptor<"retriever">; void candidateDescriptor;',
      'declare const acquisitionFactory: CapabilityAcquisitionFactory<"retriever">; void acquisitionFactory; void acquireCapabilityBindings; void registerCapabilityAcquisitionFactory;',
      "void A2A_PROTOCOL_VERSION; void A2A_SDK_VERSION; void createA2AClient;",
      "void MCP_PROTOCOL_VERSION; void MCP_SERVER_SDK_VERSION; void createMcpStatelessHost;",
      "void createSpecificationOperation;",
      "type RootTypes = [AgentDefinition, AgentEvent, AgentResult, Tool, ToolConfig, ToolCall, ToolExecutionResult, ToolExecutionFailure, WorkflowExecutionPlan, ConversationEvent, ConversationSnapshot, ConversationState, ConversationStore];",
      "declare const rootTypes: RootTypes; void rootTypes;",
      "type SpecificationTypes = [Specification, SpecificationDecision, CompiledSpecification<unknown>, SpecificationPolicy, SpecificationReviewView, SpecificationReviewItem, SpecificationReviewRelationship, SpecificationScopeId, SpecificationSourceSnapshot, SpecificationAdapterSupport, SpecificationDiagnostic, SpecificationDiagnosticImpact, SpecificationDiagnosticSeverity, SpecificationOperation, SpecificationOperationDisposition, SpecificationOperationId, SpecificationOperationMatrix, SpecificationSourceContract];",
      "declare const specificationTypes: SpecificationTypes; void specificationTypes;",
      "type AgentRuntimeTypes = [AgentDefinition, PreparedAgentDefinition, AgentRunner, AgentRunnerProfile, AgentStartRequest, ExecutableTool, ToolDefinition];",
      "declare const agentRuntimeTypes: AgentRuntimeTypes; void agentRuntimeTypes;",
      "type ControlTypes = [ExecuteControlledToolInput, ControlledToolExecutionOutcome];",
      "declare const controlTypes: ControlTypes; void controlTypes;",
      "type InteractionTypes = [ConversationStore, ConversationSnapshot, InteractionSession, InteractionSessionIdentityPort];",
      "declare const interactionTypes: InteractionTypes; void interactionTypes;",
      "type ContextArtifactTypes = [ContextEntry, ContextSelection, Artifact, ArtifactRef];",
      "declare const contextArtifactTypes: ContextArtifactTypes; void contextArtifactTypes;",
      "type EvaluationTypes = [EvaluationCase, EvaluationComposition, EvaluationResult];",
      "declare const evaluationTypes: EvaluationTypes; void evaluationTypes;",
      "type UiTypes = [AiSdkUiProjectionChunk, AssistantUiProjectionCommand, AssistantUiProjectionOptions, ChatKitProjectionEvent, NluxInteractionAdapterOptions, NluxProjectionSignal];",
      "declare const uiTypes: UiTypes; void uiTypes;",
      "type ProtocolTypes = [A2AClient, Transport, McpStatelessHost, McpStatelessHostDefinition];",
      "declare const protocolTypes: ProtocolTypes; void protocolTypes;",
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
  "Verified 35 ESM-only ADR-016 exports from an isolated packed runtime and declaration consumer.",
);
