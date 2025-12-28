import type { RetryPolicy } from "./types";
import { isRecord, readNumber } from "./utils";

type RetryNumbers = {
  maxRetries?: number;
  timeoutMs?: number;
};

const MAX_RETRY_KEYS = ["maxRetries", "max_retries", "numRetries", "num_retries", "retries"];
const TIMEOUT_KEYS = ["timeout", "timeoutMs", "timeout_ms", "requestTimeout", "request_timeout"];
const RETRY_CONTAINER_KEYS = [
  "retry",
  "retryOptions",
  "retryConfig",
  "retrySettings",
  "requestOptions",
];

const readNumberFromKeys = (value: unknown, keys: string[]) => {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    const numeric = readNumber(value[key]);
    if (numeric !== undefined) {
      return numeric;
    }
  }
  return undefined;
};

const readRetryNumbers = (value: unknown): RetryNumbers => ({
  maxRetries: readNumberFromKeys(value, MAX_RETRY_KEYS),
  timeoutMs: readNumberFromKeys(value, TIMEOUT_KEYS),
});

const mergeRetryNumbers = (base: RetryNumbers, next: RetryNumbers): RetryNumbers => ({
  maxRetries: base.maxRetries ?? next.maxRetries,
  timeoutMs: base.timeoutMs ?? next.timeoutMs,
});

const toRetryPolicy = (input: RetryNumbers): RetryPolicy | undefined => {
  if (input.maxRetries === undefined && input.timeoutMs === undefined) {
    return undefined;
  }
  const maxRetries = input.maxRetries !== undefined ? Math.max(0, Math.floor(input.maxRetries)) : 0;
  return {
    maxAttempts: maxRetries + 1,
    backoffMs: 0,
    timeoutMs: input.timeoutMs,
  };
};

const readRetryContainers = (value: unknown) => {
  if (!isRecord(value)) {
    return [];
  }
  const candidates: unknown[] = [];
  for (const key of RETRY_CONTAINER_KEYS) {
    if (value[key] !== undefined) {
      candidates.push(value[key]);
    }
  }
  return candidates;
};

const appendRetryCandidate = (targets: unknown[], candidate: unknown) => {
  targets.push(candidate);
  for (const container of readRetryContainers(candidate)) {
    targets.push(container);
  }
};

const expandRetryCandidates = (candidates: unknown[]) => {
  const expanded: unknown[] = [];
  for (const candidate of candidates) {
    appendRetryCandidate(expanded, candidate);
  }
  return expanded;
};

export const readRetryPolicyFromCandidates = (candidates: unknown[]): RetryPolicy | undefined => {
  const expandedCandidates = expandRetryCandidates(candidates);
  let merged: RetryNumbers = {};
  for (const candidate of expandedCandidates) {
    merged = mergeRetryNumbers(merged, readRetryNumbers(candidate));
    if (merged.maxRetries !== undefined && merged.timeoutMs !== undefined) {
      break;
    }
  }
  return toRetryPolicy(merged);
};

export const readCandidateProp = (value: unknown, key: string) =>
  isRecord(value) ? value[key] : undefined;
