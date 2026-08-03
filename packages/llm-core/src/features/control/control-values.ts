import { isCanonicalUuid } from "#contracts";
import type { ActionDigest } from "../tooling/runtime";

declare const policyEvaluationIdBrand: unique symbol;
declare const approvalIdBrand: unique symbol;
declare const cancellationIdBrand: unique symbol;

export type PolicyEvaluationId = string & {
  readonly [policyEvaluationIdBrand]: "PolicyEvaluationId";
};

export type ApprovalId = string & {
  readonly [approvalIdBrand]: "ApprovalId";
};

export type CancellationId = string & {
  readonly [cancellationIdBrand]: "CancellationId";
};

const controlId = <TId extends string>(value: string, label: string): TId => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError(`${label} must be a canonical lowercase RFC 9562 UUID.`);
  }
  return value as TId;
};

export const policyEvaluationId = (value: string): PolicyEvaluationId =>
  controlId<PolicyEvaluationId>(value, "Policy evaluation IDs");

export const approvalId = (value: string): ApprovalId =>
  controlId<ApprovalId>(value, "Approval IDs");

export const cancellationId = (value: string): CancellationId =>
  controlId<CancellationId>(value, "Cancellation IDs");

export type ControlMaybePromise<T> = T | Promise<T>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const actionDigestsMatch = (left: ActionDigest, right: unknown): boolean => {
  if (!isRecord(right) || !isRecord(right.keyRef)) {
    return false;
  }
  return (
    right.algorithm === left.algorithm &&
    right.keyRef.secretId === left.keyRef.secretId &&
    right.value === left.value
  );
};

export const isCanonicalTimestamp = (value: string): boolean => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};

export const isExpired = (expiresAt: string, now: string): boolean => {
  if (!isCanonicalTimestamp(expiresAt) || !isCanonicalTimestamp(now)) {
    return true;
  }
  return Date.parse(now) >= Date.parse(expiresAt);
};
