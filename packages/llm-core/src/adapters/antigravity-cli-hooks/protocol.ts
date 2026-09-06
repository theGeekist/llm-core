import type { JsonValue } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export type AntigravityCliResultStatus =
  | "SUCCESS"
  | "ERROR"
  | "CANCELED"
  | "INTERRUPTED"
  | "INVALID"
  | "WAITING"
  | "RUNNING";

export interface AntigravityInitEvent {
  readonly event: "init";
  readonly conversation_id: string;
  readonly init: Readonly<Record<string, JsonValue>>;
}

export interface AntigravityStepUpdateEvent {
  readonly event: "step_update";
  readonly step_update: Readonly<{
    conversation_id: string;
    step_index: number;
    state: "ACTIVE" | "DONE";
    step_type: string;
    text_delta?: string;
    [key: string]: JsonValue | undefined;
  }>;
}

export interface AntigravityResultEvent {
  readonly event: "result";
  readonly result: Readonly<{
    conversation_id: string;
    status: AntigravityCliResultStatus;
    response: string;
    error?: string;
    [key: string]: JsonValue | undefined;
  }>;
}

export type AntigravityStreamEvent =
  | AntigravityInitEvent
  | AntigravityStepUpdateEvent
  | AntigravityResultEvent;

export interface AntigravityCliCommand {
  readonly prompt: string;
  readonly conversationId?: string;
  readonly outputFormat: "stream-json";
}

export interface AntigravityProcessHandle {
  readonly conversationId?: string;
  readonly events: AsyncIterable<AntigravityStreamEvent>;
  cancel(): MaybePromise<void>;
}

export interface AntigravityCliSourceContract {
  readonly executable: "agy";
  readonly version: string;
}

/** Process ownership and transport are supplied by the application composition root. */
export interface AntigravityCliClient {
  readonly sourceContract: AntigravityCliSourceContract;
  spawn(command: AntigravityCliCommand): MaybePromise<AntigravityProcessHandle>;
}

export interface AntigravityHookInboxEnvelope {
  readonly conversationId: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly content: JsonValue;
  readonly submittedAt: string;
}

interface AntigravityHookCommonInput {
  readonly conversationId: string;
}

/** Validated projection supplied after composition-owned native hook wire decoding. */
export type AntigravityHookInvocationProjection =
  | {
      readonly boundary: "PreInvocation";
      readonly input: AntigravityHookCommonInput & {
        readonly invocationNum: number;
        readonly initialNumSteps: number;
      };
    }
  | {
      readonly boundary: "PostInvocation";
      readonly input: AntigravityHookCommonInput & {
        readonly invocationNum: number;
        readonly initialNumSteps: number;
      };
    }
  | {
      readonly boundary: "Stop";
      readonly input: AntigravityHookCommonInput & {
        readonly executionNum: number;
        readonly terminationReason: string;
        readonly error?: string;
        readonly fullyIdle: boolean;
      };
    };

export interface AntigravityHookProjectedInput {
  readonly messageId: string;
  readonly correlationId: string;
}

export interface AntigravityHookRefusedInput extends AntigravityHookProjectedInput {
  readonly reasonCode: "stop-boundary-refused";
}

interface AntigravityPreparedHookResultBase {
  readonly claimId: string;
  commit(): MaybePromise<void>;
  release(): MaybePromise<void>;
}

export type AntigravityPreparedHookResult =
  | (AntigravityPreparedHookResultBase & {
      readonly boundary: "PreInvocation";
      readonly output?: { readonly injectSteps: readonly { readonly userMessage: string }[] };
      readonly projectedInputs: readonly AntigravityHookProjectedInput[];
      readonly refusedInputs: readonly [];
    })
  | (AntigravityPreparedHookResultBase & {
      readonly boundary: "PostInvocation";
      readonly output?: {
        readonly injectSteps: readonly { readonly userMessage: string }[];
        readonly terminationBehavior: "force_continue";
      };
      readonly projectedInputs: readonly AntigravityHookProjectedInput[];
      readonly refusedInputs: readonly [];
    })
  | (AntigravityPreparedHookResultBase & {
      readonly boundary: "Stop";
      readonly output: { readonly decision: "stop" };
      readonly projectedInputs: readonly [];
      readonly refusedInputs: readonly AntigravityHookRefusedInput[];
    });

/** Correlated host-owned hook inbox for execution-boundary delivery. */
export interface AntigravityHookInbox {
  write(envelope: AntigravityHookInboxEnvelope): MaybePromise<void>;
  remove(conversationId: string, messageId: string, correlationId: string): MaybePromise<void>;
  prepare(
    invocation: AntigravityHookInvocationProjection,
  ): MaybePromise<AntigravityPreparedHookResult>;
}

export class AntigravityCliError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AntigravityCliError";
    this.code = code;
  }
}

export class AntigravityConcurrentRunError extends AntigravityCliError {
  constructor(conversationId: string) {
    super(
      "concurrent-run-rejected",
      `Active conversation ${conversationId} cannot accept a concurrent headless continuation.`,
    );
    this.name = "AntigravityConcurrentRunError";
  }
}
