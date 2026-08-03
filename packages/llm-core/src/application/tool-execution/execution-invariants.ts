import { isUuidV7, type RunId } from "#contracts";
import type {
  RedactionMetadata,
  ToolExecutionReceipt,
  ToolReceiptState,
} from "../../features/evidence/public";
import { actionDigestsEqual } from "../../features/evidence/runtime";
import type { BoundAction, EffectClass } from "../../features/tooling/orchestration";
import { verifyCompilationAuthority } from "../specification-compiler/runtime";
import type { ControlledToolExecutionOutcome, ExecuteControlledToolInput } from "./types";
import { ToolExecutionCoordinationError } from "./types";

export const DEFAULT_REDACTION: RedactionMetadata = {
  kind: "evidence-only",
  categories: ["arguments", "result", "credentials", "native-payload"],
};

const TERMINAL_STATES = new Set<ToolReceiptState>([
  "denied",
  "expired",
  "cancelled_before_start",
  "succeeded",
  "failed_after_start",
  "reconciliation_required",
  "compensation_required",
  "compensating",
  "compensated",
  "compensation_failed",
]);

export const meaningfulEffect = (effectClass: EffectClass): boolean => effectClass !== "read-only";

export const mintedId = <TId extends string>(value: TId, label: string): TId => {
  if (!isUuidV7(value)) {
    throw new TypeError(`${label} identity ports must mint canonical UUIDv7 IDs.`);
  }
  return value;
};

export const requireRunId = (input: ExecuteControlledToolInput): RunId => {
  const runId = input.call.invocation.runId;
  if (!runId) {
    throw new ToolExecutionCoordinationError(
      "Controlled tool execution requires InvocationContext.runId.",
    );
  }
  return runId;
};

const sameDigest = (
  left: {
    readonly algorithm: string;
    readonly keyRef: { readonly secretId: string };
    readonly value: string;
  },
  right: typeof left,
): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const sameToolTarget = (
  left: NonNullable<ExecuteControlledToolInput["specification"]>["compiled"]["value"]["tool"],
  right: ExecuteControlledToolInput["tool"]["definition"],
): boolean =>
  left.id === right.id &&
  left.version === right.version &&
  left.effect.class === right.effect.class &&
  left.effect.targets.length === right.effect.targets.length &&
  left.effect.targets.every(
    (target, index) =>
      target.kind === right.effect.targets[index]?.kind &&
      target.id === right.effect.targets[index]?.id,
  ) &&
  left.execution.concurrency === right.execution.concurrency &&
  left.execution.cancellation === right.execution.cancellation &&
  left.execution.idempotency === right.execution.idempotency &&
  left.execution.retryAfterStart === right.execution.retryAfterStart;

const specificationMatchesAction = (
  input: ExecuteControlledToolInput,
  bound: BoundAction,
): boolean => {
  const plan = input.specification?.compiled.value;
  if (plan === undefined) return true;
  try {
    return (
      sameToolTarget(plan.tool, input.tool.definition) &&
      plan.action.canonicalDocument === bound.canonicalDocument &&
      sameDigest(plan.action.digest, bound.digest)
    );
  } catch {
    return false;
  }
};

export const verifySpecification = async (
  input: ExecuteControlledToolInput,
  bound?: BoundAction,
): Promise<void> => {
  if (input.specification === undefined) return;
  await verifyCompilationAuthority({
    compiled: input.specification.compiled,
    authority: input.specification.authority,
  });
  if (bound && !specificationMatchesAction(input, bound)) {
    throw new TypeError("Compiled specification does not authorize this controlled tool action.");
  }
};

export const assertReceiptIdentity = (
  receipt: ToolExecutionReceipt,
  expected: {
    receiptId?: ToolExecutionReceipt["receiptId"];
    runId?: ToolExecutionReceipt["runId"];
    toolCallId?: ToolExecutionReceipt["toolCallId"];
    actionDigest: ToolExecutionReceipt["actionDigest"];
  },
): void => {
  if (
    (expected.receiptId && receipt.receiptId !== expected.receiptId) ||
    (expected.runId && receipt.runId !== expected.runId) ||
    (expected.toolCallId && receipt.toolCallId !== expected.toolCallId) ||
    !actionDigestsEqual(receipt.actionDigest, expected.actionDigest)
  ) {
    throw new ToolExecutionCoordinationError(
      "Receipt journal returned mismatched execution facts.",
    );
  }
};

export const existingOutcome = (
  receipt: ToolExecutionReceipt,
): ControlledToolExecutionOutcome | null => {
  if (receipt.state === "started" || receipt.state === "indeterminate") {
    return { status: "indeterminate", receipt, eventDelivery: "not-configured" };
  }
  if (TERMINAL_STATES.has(receipt.state)) {
    return { status: "existing", receipt, eventDelivery: "not-configured" };
  }
  return null;
};
