import type { MaybePromise } from "#shared/maybe";
import { isPromiseLike, maybeChain } from "#shared/maybe";
import { isRegisteredRuntimeCapabilityBinding } from "./validation";
import type { AnyRegisteredRuntimeCapabilityBinding } from "./types";

export const RETRY_GUARANTEE_CAPABILITIES = {
  "read-only": "llm-core.retry.read-only",
  idempotent: "llm-core.retry.provider-idempotent",
  reconciled: "llm-core.retry.reconciled",
} as const;

export type RetryGuarantee = keyof typeof RETRY_GUARANTEE_CAPABILITIES;
export type CapabilityRetryReason = "timeout" | "rate-limit" | "network" | "server";

export interface QualifiedRetryPolicy {
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly retryOn: readonly CapabilityRetryReason[];
  readonly guarantee: RetryGuarantee;
}

export interface CapabilityRetryScheduler {
  wait(delayMs: number): MaybePromise<void>;
}

export interface ExecuteWithQualifiedRetryInput<TResult> {
  readonly binding: AnyRegisteredRuntimeCapabilityBinding;
  readonly effect: "read-only" | "meaningful";
  readonly phase: "before-start" | "after-start";
  readonly call: () => MaybePromise<TResult>;
  readonly policy?: QualifiedRetryPolicy;
  /**
   * Trusted classifier. Native failures are consumed here and are never placed
   * in diagnostics, receipts, events or retry state.
   */
  readonly classifyFailure?: (error: unknown) => CapabilityRetryReason | null;
  readonly scheduler?: CapabilityRetryScheduler;
}

const RETRY_REASONS = new Set<CapabilityRetryReason>([
  "timeout",
  "rate-limit",
  "network",
  "server",
]);
const MAX_ATTEMPTS = 10;
const MAX_DELAY_MS = 86_400_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(",") === keys.toSorted().join(",");

const supportedClaim = (
  binding: AnyRegisteredRuntimeCapabilityBinding,
  capabilityId: string,
): boolean =>
  binding.descriptor.claims.some(
    (claim) => claim.capabilityId === capabilityId && claim.status === "supported",
  );

// Policy validation is intentionally exhaustive at this single effect boundary.
// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePolicy = <TResult>(input: ExecuteWithQualifiedRetryInput<TResult>): void => {
  if (!isRegisteredRuntimeCapabilityBinding(input.binding)) {
    throw new TypeError("Qualified retry requires a registered capability binding.");
  }
  if (
    (input.effect !== "read-only" && input.effect !== "meaningful") ||
    (input.phase !== "before-start" && input.phase !== "after-start") ||
    typeof input.call !== "function"
  ) {
    throw new TypeError("Qualified retry requires a closed effect phase and live call.");
  }
  if (input.binding.kind === "tool") {
    const toolEffect =
      input.binding.port.spec.effect.class === "read-only" ? "read-only" : "meaningful";
    if (input.effect !== toolEffect) {
      throw new TypeError("Tool retry qualification must match the registered tool effect.");
    }
  }
  const policy = input.policy;
  if (policy === undefined) {
    return;
  }
  if (
    !isRecord(policy) ||
    !hasExactKeys(policy, ["maxAttempts", "delayMs", "retryOn", "guarantee"]) ||
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > MAX_ATTEMPTS ||
    !Number.isSafeInteger(policy.delayMs) ||
    policy.delayMs < 0 ||
    policy.delayMs > MAX_DELAY_MS ||
    !Array.isArray(policy.retryOn) ||
    policy.retryOn.length === 0 ||
    !policy.retryOn.every((reason) => RETRY_REASONS.has(reason)) ||
    new Set(policy.retryOn).size !== policy.retryOn.length ||
    !(policy.guarantee in RETRY_GUARANTEE_CAPABILITIES)
  ) {
    throw new TypeError("Retry policy must be closed, bounded and guarantee-bearing.");
  }
  if (policy.maxAttempts === 1) {
    return;
  }
  const guaranteeCapability = RETRY_GUARANTEE_CAPABILITIES[policy.guarantee];
  if (!supportedClaim(input.binding, guaranteeCapability)) {
    throw new TypeError("Retry guarantee lacks supported verified conformance evidence.");
  }
  if (input.effect === "meaningful" && policy.guarantee === "read-only") {
    throw new TypeError("Meaningful effects cannot use a read-only retry guarantee.");
  }
  const operationProvenReadOnly =
    input.binding.kind === "tool" && input.binding.port.spec.effect.class === "read-only";
  if (
    !operationProvenReadOnly &&
    policy.guarantee !== "idempotent" &&
    policy.guarantee !== "reconciled"
  ) {
    throw new TypeError("Unproven operations require idempotency or reconciliation.");
  }
  if (typeof input.classifyFailure !== "function") {
    throw new TypeError("Retries require a trusted closed failure classifier.");
  }
  if (policy.delayMs > 0 && typeof input.scheduler?.wait !== "function") {
    throw new TypeError("Delayed retries require an explicit scheduler.");
  }
};

const classify = <TResult>(
  input: ExecuteWithQualifiedRetryInput<TResult>,
  error: unknown,
): CapabilityRetryReason | null => {
  try {
    const reason = input.classifyFailure?.(error);
    return reason !== undefined && reason !== null && RETRY_REASONS.has(reason) ? reason : null;
  } catch {
    return null;
  }
};

const retryCall = <TResult>(
  input: ExecuteWithQualifiedRetryInput<TResult>,
  attempt: number,
): MaybePromise<TResult> => {
  try {
    const result = input.call();
    if (!isPromiseLike(result)) {
      return result;
    }
    return result.catch((error: unknown) => handleFailure(input, attempt, error));
  } catch (error) {
    return handleFailure(input, attempt, error);
  }
};

const handleFailure = <TResult>(
  input: ExecuteWithQualifiedRetryInput<TResult>,
  attempt: number,
  error: unknown,
): MaybePromise<TResult> => {
  const policy = input.policy;
  if (!policy || attempt >= policy.maxAttempts) {
    throw error;
  }
  const reason = classify(input, error);
  if (reason === null || !policy.retryOn.includes(reason)) {
    throw error;
  }
  if (policy.delayMs === 0) {
    return retryCall(input, attempt + 1);
  }
  return maybeChain(() => retryCall(input, attempt + 1), input.scheduler!.wait(policy.delayMs));
};

export const executeWithQualifiedRetry = <TResult>(
  input: ExecuteWithQualifiedRetryInput<TResult>,
): MaybePromise<TResult> => {
  validatePolicy(input);
  return retryCall(input, 1);
};
