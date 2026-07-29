declare const opaqueIdBrand: unique symbol;

/**
 * Compile-time identity overlay. The brand is erased to a JSON string in wire
 * schemas and never adds a field to serialized values.
 */
export type OpaqueId<TKind extends string> = string & {
  readonly [opaqueIdBrand]: TKind;
};

/**
 * @format uuid
 * @pattern ^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 */
type CoreUuidId<TKind extends string> = OpaqueId<TKind>;

/**
 * @minLength 1
 * @maxLength 255
 * @pattern ^[!-~]+$
 */
type ExternalOpaqueId<TKind extends string> = OpaqueId<TKind>;

export type InvocationId = CoreUuidId<"invocation">;
export type RunId = CoreUuidId<"run">;
export type StepId = CoreUuidId<"step">;
export type ToolCallId = CoreUuidId<"tool-call">;
export type ConversationId = CoreUuidId<"conversation">;
export type DurableJobId = CoreUuidId<"durable-job">;
export type EventId = CoreUuidId<"event">;
export type ResourceId = CoreUuidId<"resource">;
export type EvidenceId = CoreUuidId<"evidence">;

export type ProviderSessionId = ExternalOpaqueId<"provider-session">;
export type PrincipalId = ExternalOpaqueId<"principal">;
export type TenantId = ExternalOpaqueId<"tenant">;
export type CorrelationId = ExternalOpaqueId<"correlation">;
export type SecretId = ExternalOpaqueId<"secret">;

/** @pattern ^(?!0{32}$)[0-9a-f]{32}$ */
export type TraceId = OpaqueId<"trace">;
/** @pattern ^(?!0{16}$)[0-9a-f]{16}$ */
export type SpanId = OpaqueId<"span">;
/** @pattern ^[0-9a-f]{2}$ */
export type TraceFlags = OpaqueId<"trace-flags">;

export type CoreOwnedId =
  | ConversationId
  | DurableJobId
  | EventId
  | EvidenceId
  | InvocationId
  | ResourceId
  | RunId
  | StepId
  | ToolCallId;

export type ExternalId = CorrelationId | PrincipalId | ProviderSessionId | SecretId | TenantId;

export type SecretRef = {
  secretId: SecretId;
};

export type TraceContext = {
  traceId: TraceId;
  spanId: SpanId;
  traceFlags?: TraceFlags;
};

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXTERNAL_ID_PATTERN = /^[!-~]{1,255}$/;
const TRACE_ID_PATTERN = /^(?!0{32}$)[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^(?!0{16}$)[0-9a-f]{16}$/;
const TRACE_FLAGS_PATTERN = /^[0-9a-f]{2}$/;

export const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);

export const isUuidV7 = (value: unknown): value is string =>
  typeof value === "string" && UUID_V7_PATTERN.test(value);

export const isExternalId = (value: unknown): value is string =>
  typeof value === "string" && EXTERNAL_ID_PATTERN.test(value);

export const isTraceId = (value: unknown): value is TraceId =>
  typeof value === "string" && TRACE_ID_PATTERN.test(value);

export const isSpanId = (value: unknown): value is SpanId =>
  typeof value === "string" && SPAN_ID_PATTERN.test(value);

export const isTraceFlags = (value: unknown): value is TraceFlags =>
  typeof value === "string" && TRACE_FLAGS_PATTERN.test(value);

export function coreId<TId extends CoreOwnedId>(value: string): TId {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Core-owned IDs must be canonical lowercase RFC 9562 UUID strings.");
  }
  return value as TId;
}

export function newCoreId<TId extends CoreOwnedId>(value: string): TId {
  if (!isUuidV7(value)) {
    throw new TypeError("New core-owned IDs must be canonical lowercase UUIDv7 strings.");
  }
  return value as TId;
}

export function externalId<TId extends ExternalId>(value: string): TId {
  if (!isExternalId(value)) {
    throw new TypeError(
      "Externally issued IDs must contain 1–255 printable non-whitespace ASCII characters.",
    );
  }
  return value as TId;
}

export function traceId(value: string): TraceId {
  if (!isTraceId(value)) {
    throw new TypeError("Trace IDs must be 32 lowercase hexadecimal characters and non-zero.");
  }
  return value;
}

export function spanId(value: string): SpanId {
  if (!isSpanId(value)) {
    throw new TypeError("Span IDs must be 16 lowercase hexadecimal characters and non-zero.");
  }
  return value;
}

export function traceFlags(value: string): TraceFlags {
  if (!isTraceFlags(value)) {
    throw new TypeError("Trace flags must be two lowercase hexadecimal characters.");
  }
  return value;
}

export const secretRef = (value: string): SecretRef => ({
  secretId: externalId<SecretId>(value),
});
