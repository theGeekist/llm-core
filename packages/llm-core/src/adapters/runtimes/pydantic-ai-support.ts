export const PYDANTIC_AI_BRIDGE_PROTOCOL = "llm-core.pydantic-ai.bridge/v2" as const;
export const PYDANTIC_AI_ASSESSED_VERSION = "2.19.0" as const;
export const PYDANTIC_AI_ASSESSED_COMMIT = "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5" as const;
export const PYDANTIC_AI_SUPPORTED_MAJOR = 2;
export const PYDANTIC_AI_MINIMUM_MINOR = 19;

export type RuntimeOperationDisposition = "supported" | "unsupported" | "not-applicable";
export type RuntimeOperationSurface = "portable" | "native";

export interface RuntimeContractReference {
  readonly authority: string;
  readonly version: string;
  readonly source: string;
}

interface RuntimeOperationBase {
  readonly area: "model" | "tool" | "control" | "event" | "state" | "continuation";
  readonly operation: string;
  readonly surface: RuntimeOperationSurface;
  readonly owner: string;
  readonly contract: RuntimeContractReference;
  readonly detail: string;
}

export type RuntimeOperationDeclaration =
  | (RuntimeOperationBase & {
      readonly disposition: "supported" | "unsupported";
      readonly fixtures: readonly [string, ...string[]];
      readonly notApplicableEvidence?: never;
    })
  | (RuntimeOperationBase & {
      readonly disposition: "not-applicable";
      readonly fixtures: readonly [];
      readonly notApplicableEvidence: RuntimeContractReference;
    });

const portableContract: RuntimeContractReference = Object.freeze({
  authority: "@geekist/llm-core AgentRunner",
  version: "2",
  source: "packages/llm-core/src/features/agent/public.ts",
});

const nativeContract: RuntimeContractReference = Object.freeze({
  authority: "pydantic-ai-slim",
  version: PYDANTIC_AI_ASSESSED_VERSION,
  source: PYDANTIC_AI_ASSESSED_COMMIT,
});

const supportedFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#supported-exact-operations";
const definitionRejectionFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-definition-and-input-operations";
const resultRejectionFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-result-operations";
const controlRejectionFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-control-and-continuation-operations";
const typedOutputRejectionFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-typed-output-operation";
const nativeEventsRejectionFixture =
  "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-event-stream-operation";

const pydanticAiOperations: readonly RuntimeOperationDeclaration[] = [
  {
    area: "model",
    operation: "portable.agent.prepare.literal-read-only-definition",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail: "A closed literal AgentDefinition is prepared without dropping fields.",
  },
  {
    area: "model",
    operation: "portable.agent.start.text-prompt",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail: "A non-empty text prompt is passed literally to the assessed runtime.",
  },
  {
    area: "model",
    operation: "portable.agent.result.text",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail: "The assessed text result is returned as an explicit portable text value.",
  },
  {
    area: "tool",
    operation: "native.pydantic-ai.testmodel.echo-string-tool-trajectory",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail:
      "The assessed TestModel trajectory preserves one echo tool call with one string value argument and matching return.",
  },
  {
    area: "control",
    operation: "portable.tool.execute.read-only-allowlisted",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [definitionRejectionFixture],
    detail: "The bridge does not accept a caller-declared portable tool binding.",
  },
  {
    area: "event",
    operation: "portable.agent.observe.normalized-lifecycle",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail: "Adapter-owned lifecycle events satisfy the closed AgentEvent sequence contract.",
  },
  {
    area: "state",
    operation: "native.pydantic-ai.testmodel.echo-four-message-history-json",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "supported",
    fixtures: [supportedFixture],
    detail:
      "The assessed TestModel prompt, echo call, echo return and final text history is retained exactly.",
  },
  {
    area: "model",
    operation: "native.pydantic-ai.typed-output",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [typedOutputRejectionFixture],
    detail: "The bridge explicitly rejects native output_type requests.",
  },
  {
    area: "model",
    operation: "portable.agent.result.structured-json",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [resultRejectionFixture],
    detail: "No exact portable output-schema validation operation is implemented.",
  },
  {
    area: "model",
    operation: "native.pydantic-ai.binary-media-reasoning-provider-extensions",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [definitionRejectionFixture, resultRejectionFixture],
    detail: "The bridge rejects these PydanticAI and provider-native values.",
  },
  {
    area: "event",
    operation: "native.pydantic-ai.event-stream",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [nativeEventsRejectionFixture],
    detail: "The bridge explicitly rejects requests for PydanticAI native event streaming.",
  },
  {
    area: "state",
    operation: "native.pydantic-ai.dependencies-and-provider-state",
    surface: "native",
    owner: "pydantic-ai",
    contract: nativeContract,
    disposition: "unsupported",
    fixtures: [definitionRejectionFixture, resultRejectionFixture],
    detail:
      "Dependencies and provider state remain PydanticAI-owned and are not exposed by the bridge.",
  },
  {
    area: "control",
    operation: "portable.agent.cancel",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [controlRejectionFixture],
    detail: "The bounded process has no live in-flight cancellation channel.",
  },
  {
    area: "control",
    operation: "portable.agent.intervene",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [controlRejectionFixture],
    detail: "PydanticAI deferred calls are not llm-core authenticated interventions.",
  },
  {
    area: "state",
    operation: "portable.agent.resume.checkpoint",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [controlRejectionFixture],
    detail: "PydanticAI message history is not an llm-core checkpoint.",
  },
  {
    area: "continuation",
    operation: "portable.agent.continue.provider-session",
    surface: "portable",
    owner: "@geekist/llm-core",
    contract: portableContract,
    disposition: "unsupported",
    fixtures: [controlRejectionFixture],
    detail: "A new run with history is not provider-session, live or durable continuation.",
  },
];

export const PYDANTIC_AI_OPERATIONS: readonly RuntimeOperationDeclaration[] = Object.freeze(
  pydanticAiOperations.map(
    (operation) =>
      Object.freeze({
        ...operation,
        fixtures: Object.freeze([...operation.fixtures]),
      }) as RuntimeOperationDeclaration,
  ),
);

export interface PydanticAiBridgeHandshake {
  readonly protocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly pythonVersion: string;
  readonly pydanticAiVersion: string;
  readonly pydanticAiAvailable: boolean;
  readonly operations: readonly RuntimeOperationDeclaration[];
}

export interface RuntimeOperationMatrix {
  readonly adapterId: "llm-core.runtime.pydantic-ai";
  readonly bridgeProtocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly assessedRelease: typeof PYDANTIC_AI_ASSESSED_VERSION;
  readonly assessedCommit: typeof PYDANTIC_AI_ASSESSED_COMMIT;
  readonly supportedReleaseRange: "==2.19.0";
  readonly pythonVersions: ">=3.10 <3.15";
  readonly conformanceEvidence: "local-executable-operation-fixtures";
  readonly operations: readonly RuntimeOperationDeclaration[];
}

export const PYDANTIC_AI_OPERATION_MATRIX: RuntimeOperationMatrix = Object.freeze({
  adapterId: "llm-core.runtime.pydantic-ai",
  bridgeProtocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
  assessedRelease: PYDANTIC_AI_ASSESSED_VERSION,
  assessedCommit: PYDANTIC_AI_ASSESSED_COMMIT,
  supportedReleaseRange: "==2.19.0",
  pythonVersions: ">=3.10 <3.15",
  conformanceEvidence: "local-executable-operation-fixtures",
  operations: PYDANTIC_AI_OPERATIONS,
});
