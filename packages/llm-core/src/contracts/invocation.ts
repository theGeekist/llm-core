import type {
  ConversationId,
  CorrelationId,
  InvocationId,
  PrincipalId,
  RunId,
  SecretRef,
  StepId,
  TenantId,
  ToolCallId,
  TraceContext,
} from "./identity.js";

/**
 * A portable non-negative integer limit.
 *
 * @minimum 0
 * @asType integer
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type InvocationLimit = number;

/** @pattern ^[A-Z]{3}$ */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type CurrencyCode = string;

/** @pattern ^(?:0|[1-9][0-9]*)$ */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type MinorUnits = string;

/** @format date-time */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named wire-schema type
export type DeadlineTimestamp = string;

/**
 * The authenticated principal on whose authority an invocation executes.
 *
 * Authentication material is deliberately absent. Hosts resolve the opaque
 * identifier at their trust boundary.
 */
export interface PrincipalRef {
  principalId: PrincipalId;
}

/**
 * The tenant/security domain that owns an invocation.
 */
export interface TenantRef {
  tenantId: TenantId;
}

/**
 * Portable, guarantee-bearing limits for one invocation.
 *
 * Monetary limits use integer minor units encoded as decimal strings so the
 * wire contract does not lose precision across runtimes.
 */
export interface InvocationBudget {
  maxModelCalls?: InvocationLimit;
  maxToolCalls?: InvocationLimit;
  maxInputTokens?: InvocationLimit;
  maxOutputTokens?: InvocationLimit;
  maxTotalTokens?: InvocationLimit;
  maxDurationMs?: InvocationLimit;
  maxCost?: InvocationCostLimit;
}

export interface InvocationCostLimit {
  currency: CurrencyCode;
  minorUnits: MinorUnits;
}

/**
 * Stable execution identity and authority propagated through capability ports.
 *
 * The context is portable JSON. It contains secret references, never secret
 * values, and has no generic extension escape hatch through which credentials
 * or live framework values could enter. Provider-native metadata belongs on
 * the request/response contracts that own it.
 */
export interface InvocationContext {
  invocationId: InvocationId;
  runId?: RunId;
  stepId?: StepId;
  toolCallId?: ToolCallId;
  conversationId?: ConversationId;
  correlationId?: CorrelationId;
  principal?: PrincipalRef;
  tenant?: TenantRef;
  delegationChain?: PrincipalRef[];
  trace?: TraceContext;
  deadlineAt?: DeadlineTimestamp;
  budget?: InvocationBudget;
  secretRefs?: SecretRef[];
}
