import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../..");
const baselineCommit = "17d2b38";
const currentCommit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
  cwd: packageRoot,
  encoding: "utf8",
}).trim();

if (currentCommit !== baselineCommit) {
  throw new Error(
    `This inventory records the pre-rollout public surface at ${baselineCommit}; ` +
      `run it from a clean checkout of that commit, not ${currentCommit}.`,
  );
}

const entrypoints = new Map([
  ["root", "index.ts"],
  ["./functional", "src/functional/index.ts"],
  ["./contracts", "src/contracts/public.ts"],
  ["./model", "src/features/model/public.ts"],
  ["./tools", "src/features/tooling/public.ts"],
  ["./control", "src/control/index.ts"],
  ["./evidence", "src/features/evidence/public.ts"],
  ["./state", "src/features/state/public.ts"],
  ["./context", "src/features/context/public.ts"],
  ["./artifacts", "src/features/artifacts/public.ts"],
  ["./evaluation", "src/features/evaluation/public.ts"],
  ["./agent", "src/agent/index.ts"],
  ["./workflow", "src/workflow/index.ts"],
  ["./interaction", "src/interaction/index.ts"],
  ["./adapters/ai-sdk", "src/adapters/ai-sdk/index.ts"],
  ["./adapters/ai-sdk-ui", "src/adapters/ai-sdk-ui/index.ts"],
  ["./adapters/assistant-ui", "src/adapters/assistant-ui/index.ts"],
  ["./adapters/openai-chatkit", "src/adapters/openai-chatkit/index.ts"],
  ["./adapters/nlux-ui", "src/adapters/nlux-ui/index.ts"],
]);
const expectedCounts = new Map([
  ["root", 11],
  ["./functional", 14],
  ["./contracts", 96],
  ["./model", 106],
  ["./tools", 50],
  ["./control", 41],
  ["./evidence", 25],
  ["./state", 51],
  ["./context", 13],
  ["./artifacts", 6],
  ["./evaluation", 18],
  ["./agent", 190],
  ["./workflow", 35],
  ["./interaction", 37],
  ["./adapters/ai-sdk", 20],
  ["./adapters/ai-sdk-ui", 7],
  ["./adapters/assistant-ui", 5],
  ["./adapters/openai-chatkit", 2],
  ["./adapters/nlux-ui", 4],
]);

const commonByEntrypoint = new Map([
  [
    "./model",
    new Set([
      "createBuiltinModel",
      "deploymentRef",
      "DeploymentRef",
      "FinishReason",
      "Model",
      "ModelCompletion",
      "ModelContentPart",
      "ModelError",
      "ModelErrorCode",
      "ModelErrorResponse",
      "ModelGenerateInput",
      "ModelMessage",
      "ModelOutputParser",
      "ModelRequest",
      "ModelResponse",
      "ModelRole",
      "ModelStreamEvent",
      "ModelStreamInput",
      "ModelUsage",
      "ModelWarning",
      "ParsedModelOutput",
      "preparePromptTemplate",
      "PromptInputField",
      "PromptTemplate",
      "PromptValueType",
      "providerRef",
      "ProviderRef",
      "ProviderRequestMetadata",
      "ProviderResponseMetadata",
      "ReasoningPart",
      "ResponseFormat",
      "SamplingParams",
      "ToolCallPart",
      "ToolChoice",
      "ToolDeclaration",
      "ToolResultPart",
      "WarningSeverity",
    ]),
  ],
  [
    "./tools",
    new Set([
      "EffectClass",
      "EffectTarget",
      "EffectTargetKind",
      "ToolArgumentIssue",
      "ToolArgumentValidationError",
      "ToolCall",
      "ToolEffect",
      "ToolId",
      "toolId",
      "ToolVersion",
    ]),
  ],
  [
    "./control",
    new Set([
      "ApprovalDecision",
      "ApprovalRef",
      "ApprovalRequest",
      "CancellationAcknowledgement",
      "CancellationRef",
      "CancellationRequest",
      "CancellationResolution",
      "PolicyDecision",
      "PolicyFact",
    ]),
  ],
  [
    "./agent",
    new Set([
      "AgentCancellationAcknowledgement",
      "AgentCancellationRequest",
      "AgentInterventionAcknowledgement",
      "AgentInterventionRequestFacts",
      "AgentProgressFacts",
      "AgentRun",
      "AgentRunEventFactsByKind",
      "AgentRunEventKind",
      "AgentRunTerminalStatus",
      "AgentSkillRef",
    ]),
  ],
  [
    "./workflow",
    new Set([
      "defineWorkflow",
      "WorkflowRetryDelayInput",
      "WorkflowRetryPolicy",
      "WorkflowRollbackContext",
      "WorkflowRollbackFailure",
      "WorkflowRollbackMode",
      "WorkflowShouldRetryInput",
      "WorkflowStepContext",
      "WorkflowStepResult",
    ]),
  ],
]);

const internalByEntrypoint = new Map([
  ["root", new Set(["MaybeAsyncIterable", "MaybePromise"])],
  ["./functional", new Set()],
  [
    "./model",
    new Set([
      "BindingSnapshot",
      "BUILTIN_DEPLOYMENT",
      "BUILTIN_MODEL",
      "BUILTIN_PROVIDER",
      "BUILTIN_TEXT_CAPABILITY",
      "ClaimSnapshot",
      "isRegisteredModelProfile",
      "isRegisteredSchemaDocument",
      "RegisteredModelProfile",
      "RegisteredSchemaDocument",
      "safeNativeScalar",
      "sanitizeNativeMetadata",
    ]),
  ],
  [
    "./tools",
    new Set([
      "canonicalizeJson",
      "isRegisteredToolBinding",
      "normalizeStrictJson",
      "RegisteredToolSchema",
    ]),
  ],
  [
    "./evidence",
    new Set([
      "actionDigestsEqual",
      "classifyExistingReservation",
      "isToolReceiptTransitionAllowed",
      "reservationKeysEqual",
    ]),
  ],
  [
    "./agent",
    new Set([
      "assertRegisteredRuntimeCapabilityBinding",
      "AnyRegisteredRuntimeCapabilityBinding",
      "isPreparedAgentSpec",
      "isRegisteredRuntimeCapabilityBinding",
      "registerCapabilityInvocation",
      "registerAgentSkill",
      "registerCacheRecord",
      "registerConversationRecord",
      "registerConversationTurn",
      "registerPortableJsonObject",
      "registerPortableJsonValue",
      "registerRuntimeCapabilityBinding",
      "registerStorageValue",
      "RegisteredRuntimeCapabilityBinding",
    ]),
  ],
  [
    "./interaction",
    new Set([
      "isRegisteredInteractionContentEvent",
      "reduceInteractionProjection",
      "registerConversationSessionSnapshot",
      "RegisteredInteractionContentEvent",
      "registerInteractionContentEvent",
    ]),
  ],
  [
    "./state",
    new Set([
      "isRegisteredResumableCheckpoint",
      "RegisteredResumableCheckpoint",
      "registerRecordedEffect",
      "registerResumableCheckpoint",
    ]),
  ],
]);

const exactReplacements = new Map([
  ["root:AgentRun", ["common", "root + ./agent", "keep"]],
  ["root:AgentRunEvent", ["common", "./agent", "rename:AgentEvent"]],
  ["root:AgentRunner", ["extension", "./agent/runtime", "move"]],
  ["root:AgentRunnerCapabilities", ["extension", "./agent/runtime", "rename:AgentRunnerProfile"]],
  ["root:AgentRunRequest", ["extension", "./agent/runtime", "rename:AgentStartRequest"]],
  ["root:AgentSpec", ["extension", "./agent/runtime", "rename:AgentDefinition"]],
  ["root:createLocalAgentRunner", ["extension", "./agent/runtime", "move"]],
  ["root:PreparedAgentSpec", ["extension", "./agent/runtime", "rename:PreparedAgentDefinition"]],
  ["root:RunResult", ["common", "./agent", "rename:AgentResult"]],
  ["./agent:AgentRun", ["common", "root + ./agent", "keep"]],
  ["./agent:AgentRunEvent", ["common", "./agent", "rename:AgentEvent"]],
  [
    "./agent:AgentRunnerCapabilities",
    ["extension", "./agent/runtime", "rename:AgentRunnerProfile"],
  ],
  ["./agent:AgentRunRequest", ["extension", "./agent/runtime", "rename:AgentStartRequest"]],
  ["./agent:AgentSpec", ["extension", "./agent/runtime", "rename:AgentDefinition"]],
  ["./agent:createLocalAgentRunner", ["extension", "./agent/runtime", "move"]],
  ["./agent:PreparedAgentSpec", ["extension", "./agent/runtime", "rename:PreparedAgentDefinition"]],
  ["./agent:RunResult", ["common", "./agent", "rename:AgentResult"]],
  ["./tools:ToolSpec", ["extension", "./tools/runtime", "rename:ToolDefinition"]],
  ["./tools:defineToolSpec", ["extension", "./tools/runtime", "rename:defineToolDefinition"]],
  [
    "./tools:ToolBinding",
    ["split", "./tools + ./tools/runtime", "add:Tool;rename-extension:ExecutableTool"],
  ],
  ["./tools:registerToolSchema", ["extension", "./tools/runtime", "rename:defineToolSchema"]],
  ["./tools:ToolResult", ["common", "./tools", "rename:ToolExecutionResult"]],
  ["./tools:ToolFailure", ["common", "./tools", "rename:ToolExecutionFailure"]],
  ["./workflow:WorkflowDefinition", ["common", "./workflow", "rename:WorkflowConfig"]],
  ["./workflow:ExecutableWorkflowStep", ["common", "./workflow", "rename:WorkflowStep"]],
  ["./workflow:WorkflowExecutionOutcome", ["common", "./workflow", "rename:WorkflowResult"]],
  ["./workflow:WorkflowPauseSnapshot", ["common", "./workflow", "rename:WorkflowPause"]],
  ["./workflow:WorkflowTransition", ["internal", null, "remove-export"]],
  [
    "./workflow:WorkflowStepResult",
    [
      "split",
      "./workflow + ./workflow/runtime",
      "add:WorkflowStepResult;rename-extension:ControlledWorkflowStepResult",
    ],
  ],
  [
    "./workflow:WorkflowResumeOutcome",
    ["extension", "./workflow/runtime", "rename:ControlledWorkflowResult"],
  ],
  [
    "./workflow:MeaningfulWorkflowStep",
    ["extension", "./workflow/runtime", "rename:ControlledWorkflowStep"],
  ],
  [
    "./workflow:MeaningfulWorkflowStepExecuteInput",
    ["extension", "./workflow/runtime", "rename:ControlledWorkflowStepExecuteInput"],
  ],
  [
    "./interaction:InteractionUiEvent",
    ["split", "./conversation + ./interaction", "add:ConversationEvent;keep-extension"],
  ],
  [
    "./interaction:ConversationTurn",
    ["extension", "./interaction", "rename:ConversationRunRecord"],
  ],
  ["./agent:ConversationTurn", ["extension", "./memory", "rename:ConversationMessage"]],
  ["./context:ContextManifest", ["common", "./context", "rename:ContextSelection"]],
  ["./context:ContextManifestInput", ["common", "./context", "rename:ContextSelectionInput"]],
  ["./context:createContextManifest", ["common", "./context", "rename:selectContext"]],
  ["./model:registerModelProfile", ["extension", "./model/runtime", "rename:createModelProfile"]],
  [
    "./model:registerImageGenerationResult",
    ["extension", "./media", "rename:createImageGenerationResult"],
  ],
  ["./model:registerMediaResourceRef", ["extension", "./media", "rename:createMediaResourceRef"]],
  [
    "./model:registerParsedModelOutput",
    ["extension", "./model/runtime", "rename:createParsedModelOutput"],
  ],
  [
    "./model:registerProjectedMediaContent",
    ["extension", "./media", "rename:createProjectedMediaContent"],
  ],
  [
    "./model:registerSpeechGenerationResult",
    ["extension", "./media", "rename:createSpeechGenerationResult"],
  ],
  [
    "./model:registerTranscriptionResult",
    ["extension", "./media", "rename:createTranscriptionResult"],
  ],
  ["./evidence:ExecutionEvent", ["extension", "./evidence", "rename:ToolExecutionEvent"]],
]);

const extensionTarget = (entrypoint, source) => {
  if (entrypoint.startsWith("./adapters/")) return entrypoint;
  const featureMatch = source?.match(
    /src\/features\/(retrieval|indexing|storage|memory|media|evidence|state)\//,
  );
  if (featureMatch) return `./${featureMatch[1]}`;
  if (source?.includes("/interaction/")) return "./interaction";
  if (source?.includes("/workflow/")) return "./workflow/runtime";
  if (source?.includes("/tooling/") || source?.includes("/tool-execution/")) {
    return "./tools/runtime";
  }
  if (source?.includes("/model/")) return "./model/runtime";
  if (source?.includes("/control/")) return "./control/runtime";
  if (
    source?.includes("/agent/") ||
    source?.includes("/capability-bindings/") ||
    entrypoint === "root"
  ) {
    return "./agent/runtime";
  }
  return entrypoint;
};

const symbolKind = (symbol) => {
  const hasRuntime = (symbol.flags & ts.SymbolFlags.Value) !== 0;
  const hasType = (symbol.flags & ts.SymbolFlags.Type) !== 0;
  if (hasRuntime && hasType) return "runtime+type";
  if (hasRuntime) return "runtime";
  return "type";
};

const classify = ({ entrypoint, name, source }) => {
  const replacement = exactReplacements.get(`${entrypoint}:${name}`);
  if (replacement) {
    const [classification, target, action] = replacement;
    return { classification, target, action };
  }
  if (entrypoint === "./functional" || internalByEntrypoint.get(entrypoint)?.has(name)) {
    return { classification: "internal", target: null, action: "remove-export" };
  }
  if (
    entrypoint === "./context" ||
    entrypoint === "./artifacts" ||
    entrypoint === "./evaluation" ||
    commonByEntrypoint.get(entrypoint)?.has(name)
  ) {
    return { classification: "common", target: entrypoint, action: "keep" };
  }
  return {
    classification: "extension",
    target: extensionTarget(entrypoint, source),
    action: entrypoint === extensionTarget(entrypoint, source) ? "keep" : "move",
  };
};

const configPath = resolve(packageRoot, "tsconfig.build.json");
const configFile = ts.readConfigFile(configPath, (path) => readFileSync(path, "utf8"));
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
}
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
const rootNames = [...entrypoints.values()].map((path) => resolve(packageRoot, path));
const program = ts.createProgram(rootNames, parsedConfig.options);
const checker = program.getTypeChecker();
const inventory = [];

for (const [entrypoint, entryPath] of entrypoints) {
  const sourceFile = program.getSourceFile(resolve(packageRoot, entryPath));
  if (!sourceFile) throw new Error(`Missing entrypoint: ${entryPath}`);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error(`Missing module symbol: ${entryPath}`);

  const exports = checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declaration = target.declarations?.[0] ?? symbol.declarations?.[0];
      const row = {
        entrypoint,
        name: symbol.getName(),
        kind: symbolKind(target),
        source: declaration ? relative(packageRoot, declaration.getSourceFile().fileName) : null,
      };
      return { ...row, ...classify(row) };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const expected = expectedCounts.get(entrypoint);
  if (exports.length !== expected) {
    throw new Error(`${entrypoint}: expected ${expected} exports, resolved ${exports.length}`);
  }
  inventory.push(...exports);
}

if (inventory.length !== 731) {
  throw new Error(`Expected 731 exports, resolved ${inventory.length}`);
}

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
