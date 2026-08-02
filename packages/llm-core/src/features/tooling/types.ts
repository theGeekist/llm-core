import type {
  ContractVersion,
  Digest,
  InvocationContext,
  JsonValue,
  PortableContent,
  PrincipalId,
  TenantId,
  ToolCallId,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { RegisteredToolSchema } from "./schema-registration";

declare const toolIdBrand: unique symbol;

export type ToolId = string & {
  readonly [toolIdBrand]: "ToolId";
};
export type ToolVersion = ContractVersion;

export type EffectClass =
  | "read-only"
  | "reversible"
  | "external-write"
  | "destructive"
  | "privileged";

export type EffectTargetKind = "resource" | "service" | "tenant" | "external-system" | "other";

export interface EffectTarget {
  kind: EffectTargetKind;
  id: string;
}

export interface ToolEffect {
  class: EffectClass;
  targets: EffectTarget[];
}

export type ExecutionConcurrency = "shared" | "exclusive";
export type CancellationSemantics = "unsupported" | "cooperative" | "provider-acknowledged";
export type IdempotencySemantics = "not-supported" | "required" | "provider-enforced";
export type RetryAfterStartSemantics = "never" | "requires-conformance";

export interface ToolExecutionSemantics {
  concurrency: ExecutionConcurrency;
  cancellation: CancellationSemantics;
  idempotency: IdempotencySemantics;
  retryAfterStart: RetryAfterStartSemantics;
}

export interface ToolDefinition {
  id: ToolId;
  version: ToolVersion;
  description: string;
  inputSchema: RegisteredToolSchema;
  effect: ToolEffect;
  execution: ToolExecutionSemantics;
}

export interface ToolCall {
  toolCallId: ToolCallId;
  toolId: ToolId;
  toolVersion: ToolVersion;
  arguments: JsonValue;
  invocation: InvocationContext;
  idempotencyKey?: string;
}

export interface ToolExecutionFailure {
  code: string;
  safeMessage?: string;
  retryable: boolean;
}

export type ToolExecutionResult =
  | {
      toolCallId: ToolCallId;
      status: "succeeded";
      content: PortableContent[];
    }
  | {
      toolCallId: ToolCallId;
      status: "failed";
      error: ToolExecutionFailure;
    };

export interface ExecutableToolValidationInput {
  call: ToolCall;
}

export interface ToolExecutionInput {
  call: ToolCall;
  control?: ToolExecutionControl;
  /** Durable ownership token that qualified mutating providers must enforce. */
  receiptFence?: Readonly<{
    receiptId: string;
    ownerId: string;
    token: number;
  }>;
}

export interface ExecutableTool {
  definition: ToolDefinition;
  validate(input: ExecutableToolValidationInput): MaybePromise<ToolCall>;
  execute(input: ToolExecutionInput): MaybePromise<ToolExecutionResult>;
}

/**
 * Live cancellation request channel. It is never serialized as a tool fact.
 * A request does not itself assert an effect disposition.
 */
export interface ToolExecutionControl {
  isCancellationRequested(): boolean;
  onCancellationRequested(handler: () => void): () => void;
}

export interface ActionDocument {
  contractProfile: "llm-core.action/v1";
  tool: {
    id: ToolId;
    version: ToolVersion;
    inputSchemaDigest: Digest;
  };
  effect: ToolEffect;
  authority: {
    tenantId?: TenantId;
    principalId?: PrincipalId;
    delegationChain?: PrincipalId[];
  };
  execution: ToolExecutionSemantics;
  arguments: JsonValue;
}
