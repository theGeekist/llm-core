export const PYDANTIC_AI_BRIDGE_PROTOCOL = "llm-core.pydantic-ai.bridge/v1" as const;
export const PYDANTIC_AI_ASSESSED_VERSION = "2.19.0" as const;
export const PYDANTIC_AI_SUPPORTED_MAJOR = 2;
export const PYDANTIC_AI_MINIMUM_MINOR = 19;

export type RuntimeSemanticDisposition = "supported" | "projected" | "unsupported";

export interface RuntimeSupportDeclaration {
  readonly area: "model" | "tool" | "control" | "event" | "state" | "continuation";
  readonly semantic: string;
  readonly disposition: RuntimeSemanticDisposition;
  readonly detail: string;
}

export const PYDANTIC_AI_SEMANTICS: readonly RuntimeSupportDeclaration[] = Object.freeze([
  {
    area: "model",
    semantic: "text-messages-and-python-output-type",
    disposition: "supported",
    detail: "Text messages and validated Python output_type values retain their meaning.",
  },
  {
    area: "model",
    semantic: "cross-language-json-output",
    disposition: "projected",
    detail:
      "AgentSpec output_schema is instruction-only; the bridge must validate JSON independently.",
  },
  {
    area: "model",
    semantic: "binary-media-reasoning-and-native-extensions",
    disposition: "unsupported",
    detail: "No portable v1 bridge representation is declared for these provider-sensitive values.",
  },
  {
    area: "tool",
    semantic: "function-tool-schema-call-id-arguments-and-result",
    disposition: "supported",
    detail:
      "Allowlisted process-local tools retain schema, call identity, JSON arguments and results.",
  },
  {
    area: "control",
    semantic: "read-only-tool-execution",
    disposition: "supported",
    detail: "Read-only tools may execute after Python-side validation.",
  },
  {
    area: "control",
    semantic: "meaningful-effects-and-approval-authority",
    disposition: "unsupported",
    detail: "Deferred PydanticAI calls are not llm-core authorization or durable effect receipts.",
  },
  {
    area: "event",
    semantic: "ordered-agent-lifecycle",
    disposition: "projected",
    detail: "Normalized lifecycle events are projected; provider event variants are not preserved.",
  },
  {
    area: "state",
    semantic: "caller-managed-message-history",
    disposition: "projected",
    detail: "Serializable history is observational state, not a resumable llm-core checkpoint.",
  },
  {
    area: "state",
    semantic: "registered-checkpoint-and-recorded-effects",
    disposition: "unsupported",
    detail:
      "PydanticAI local runs do not provide llm-core checkpoint compatibility or effect receipts.",
  },
  {
    area: "continuation",
    semantic: "provider-session-live-or-durable-continuation",
    disposition: "unsupported",
    detail:
      "A new run with message history is not provider-session, live, or durable continuation.",
  },
]);

export interface PydanticAiBridgeHandshake {
  readonly protocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly pythonVersion: string;
  readonly pydanticAiVersion: string;
  readonly pydanticAiAvailable: boolean;
  readonly semantics: readonly RuntimeSupportDeclaration[];
}

export interface RuntimeCompatibilityReport {
  readonly adapterId: "llm-core.runtime.pydantic-ai";
  readonly bridgeProtocol: typeof PYDANTIC_AI_BRIDGE_PROTOCOL;
  readonly assessedRelease: typeof PYDANTIC_AI_ASSESSED_VERSION;
  readonly assessedCommit: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5";
  readonly supportedReleaseRange: "==2.19.0";
  readonly pythonVersions: ">=3.10 <3.15";
  readonly conformanceEvidence: "documentary-projection-only";
  readonly semantics: readonly RuntimeSupportDeclaration[];
}

export const PYDANTIC_AI_COMPATIBILITY_REPORT: RuntimeCompatibilityReport = Object.freeze({
  adapterId: "llm-core.runtime.pydantic-ai",
  bridgeProtocol: PYDANTIC_AI_BRIDGE_PROTOCOL,
  assessedRelease: PYDANTIC_AI_ASSESSED_VERSION,
  assessedCommit: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
  supportedReleaseRange: "==2.19.0",
  pythonVersions: ">=3.10 <3.15",
  conformanceEvidence: "documentary-projection-only",
  semantics: PYDANTIC_AI_SEMANTICS,
});
