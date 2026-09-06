import type { JsonValue, RunId } from "#contracts";
import type {
  AdmittedAgentActiveInput,
  AgentActiveInputAcknowledgement,
} from "../../features/agent/public";
import type { MaybePromise } from "#shared/maybe";

export type CodexDesktopHookBoundary = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

interface CodexDesktopHookCommonProjection {
  readonly sessionId: string;
  readonly turnId: string;
}

/** Validated projection supplied after composition-owned Codex hook wire decoding. */
export type CodexDesktopHookInvocationProjection =
  | {
      readonly boundary: "PreToolUse" | "PostToolUse";
      readonly input: CodexDesktopHookCommonProjection & { readonly toolName: string };
    }
  | {
      readonly boundary: "UserPromptSubmit";
      readonly input: CodexDesktopHookCommonProjection;
    }
  | {
      readonly boundary: "Stop";
      readonly input: CodexDesktopHookCommonProjection & {
        readonly stopHookActive: boolean;
        readonly lastAssistantMessage?: string;
      };
    };

export interface CodexDesktopHookTarget {
  readonly sessionId: string;
  readonly turnId: string;
  readonly runId: RunId;
}

export interface CodexDesktopHookInboxEnvelope extends CodexDesktopHookTarget {
  readonly messageId: string;
  readonly correlationId: string;
  readonly content: JsonValue;
  readonly submittedAt: string;
}

export interface CodexDesktopHookClaim {
  readonly claimId: string;
  readonly entries: readonly CodexDesktopHookInboxEnvelope[];
}

/**
 * Durable storage, authorisation, retries and single-writer fencing belong to
 * application composition. Claims are atomic for the exact target tuple.
 */
export interface CodexDesktopHookInbox {
  /** Resolves `projected` only after native hook output is written successfully. */
  submitAndAwaitProjection(
    envelope: CodexDesktopHookInboxEnvelope,
  ): MaybePromise<"projected" | "refused" | "duplicate" | "rejected">;
  claim(target: CodexDesktopHookTarget): MaybePromise<CodexDesktopHookClaim>;
  commit(claimId: string, outcome: "projected" | "refused" | "empty"): MaybePromise<void>;
  release(claimId: string): MaybePromise<void>;
}

export interface CodexDesktopHookProjectedInput {
  readonly messageId: string;
  readonly correlationId: string;
  readonly projection: "additional-context" | "continuation-request";
}

export interface CodexDesktopHookRefusedInput {
  readonly messageId: string;
  readonly correlationId: string;
  readonly reason: "recursive-stop";
}

export type CodexDesktopHookOutput =
  | {
      readonly hookSpecificOutput: {
        readonly hookEventName: "PreToolUse" | "PostToolUse" | "UserPromptSubmit";
        readonly additionalContext: string;
      };
    }
  | { readonly decision: "block"; readonly reason: string };

/** The caller writes `output`, then commits; write failure must release. */
export interface CodexDesktopPreparedHookResult {
  readonly boundary: CodexDesktopHookBoundary;
  readonly output?: CodexDesktopHookOutput;
  readonly projectedInputs: readonly CodexDesktopHookProjectedInput[];
  readonly refusedInputs: readonly CodexDesktopHookRefusedInput[];
  commit(): MaybePromise<void>;
  release(): MaybePromise<void>;
}

export interface CodexDesktopHookBridge {
  submitInput(input: AdmittedAgentActiveInput): MaybePromise<AgentActiveInputAcknowledgement>;
  handle(
    invocation: CodexDesktopHookInvocationProjection,
  ): MaybePromise<CodexDesktopPreparedHookResult>;
}

export interface CodexDesktopHookIdentity {
  now(): string;
}
