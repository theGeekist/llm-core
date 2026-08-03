/* eslint-disable sonarjs/cognitive-complexity -- branches mirror fenced invocation states */
import type { ConcurrencyRequest } from "../../features/control/runtime";
import { acquireInterruptibly, isExpired, leaseMatches } from "./execution-control";
import { mergeDelivery } from "./event-projection";
import { verifySpecification } from "./execution-invariants";
import {
  appendReceipt,
  cancellationReference,
  cancelBeforeStart,
  claimExecutionFence,
  fenceIsCurrent,
} from "./receipt-persistence";
import type { ControlledExecutionPhase, ControlledToolExecutionOutcome } from "./types";
import { ToolExecutionCoordinationError } from "./types";

export const invokeExecution = async (
  phase: ControlledExecutionPhase,
): Promise<ControlledToolExecutionOutcome> => {
  const { input, bound, control, isMeaningful } = phase;
  let { receipt, delivery } = phase;
  if (control.isCancellationRequested()) {
    return cancelBeforeStart(input, receipt, delivery);
  }
  const concurrencyRequest: ConcurrencyRequest = {
    runId: receipt.runId,
    toolCallId: input.call.toolCallId,
    mode: input.tool.definition.execution.concurrency,
  };
  const lease = await acquireInterruptibly(input, concurrencyRequest, control);
  if (!lease) return cancelBeforeStart(input, receipt, delivery);
  if (!leaseMatches(lease, concurrencyRequest)) {
    try {
      await lease.release();
    } catch {
      // The invalid lease is never used for execution.
    }
    throw new ToolExecutionCoordinationError("Concurrency gate returned a mismatched lease.");
  }

  const executionClaim = await claimExecutionFence(input, receipt);
  if (executionClaim.kind === "not-found") {
    await lease.release();
    throw new ToolExecutionCoordinationError(
      "Receipt disappeared before execution ownership was claimed.",
    );
  }
  if (executionClaim.kind === "held") {
    await lease.release();
    return { status: "held", receipt: executionClaim.receipt, eventDelivery: delivery };
  }
  if (executionClaim.kind === "not-eligible") {
    await lease.release();
    return { status: "existing", receipt: executionClaim.receipt, eventDelivery: delivery };
  }
  receipt = executionClaim.receipt;
  const executionFence = executionClaim.fence;

  let cancellationObserved = control.isCancellationRequested();
  let acceptingCancellation = true;
  let executionStarted = false;
  let cancellationPersistence = Promise.resolve();
  let unsubscribe = (): void => undefined;
  const stopCancellationObservation = (): void => {
    acceptingCancellation = false;
    try {
      unsubscribe();
    } catch {
      // The local flag prevents callbacks from racing the terminal transition.
    }
    unsubscribe = () => undefined;
  };

  try {
    unsubscribe = control.onCancellationRequested(() => {
      if (!acceptingCancellation || cancellationObserved) return;
      cancellationObserved = true;
      if (executionStarted) {
        cancellationPersistence = appendReceipt(
          input,
          receipt,
          "started",
          receipt.effectDisposition,
          {
            cancellation: cancellationReference(input, receipt),
            reasonCode: "cancellation-requested-after-start",
          },
        ).then(
          (pending) => {
            receipt = pending.receipt;
            delivery = mergeDelivery(delivery, pending.delivery);
          },
          () => undefined,
        );
      }
    });
    if (cancellationObserved) return await cancelBeforeStart(input, receipt, delivery);
    if (isExpired(receipt.approvalExpiresAt, input.facts.now())) {
      const expired = await appendReceipt(input, receipt, "expired", "not-started", {
        policy: receipt.policy,
        approval: receipt.approval,
        approvalRequestedAt: receipt.approvalRequestedAt,
        approvalExpiresAt: receipt.approvalExpiresAt,
        approvalRequiredApprover: receipt.approvalRequiredApprover,
        reasonCode: "approval-expired-before-start",
      });
      return {
        status: "denied",
        receipt: expired.receipt,
        eventDelivery: mergeDelivery(delivery, expired.delivery),
      };
    }

    try {
      await verifySpecification(input);
    } catch {
      const denied = await appendReceipt(input, receipt, "denied", "not-started", {
        reasonCode: "specification-authority-invalid",
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }

    const started = await appendReceipt(
      input,
      receipt,
      "started",
      isMeaningful ? "unknown" : "none",
    );
    receipt = started.receipt;
    delivery = mergeDelivery(delivery, started.delivery);
    executionStarted = true;
    if (cancellationObserved) {
      const cancelled = await appendReceipt(input, receipt, "failed_after_start", "none", {
        cancellation: cancellationReference(input, receipt),
        reasonCode: "cancellation-observed-before-invocation",
      });
      return {
        status: "cancelled",
        receipt: cancelled.receipt,
        eventDelivery: mergeDelivery(delivery, cancelled.delivery),
      };
    }

    try {
      await verifySpecification(input, bound);
    } catch {
      const denied = await appendReceipt(input, receipt, "failed_after_start", "none", {
        reasonCode: "specification-authority-invalid-before-invocation",
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }
    if (!(await fenceIsCurrent(input.journal, receipt, executionFence))) {
      return { status: "indeterminate", receipt, eventDelivery: delivery };
    }

    try {
      const result = await input.tool.execute({
        call: input.call,
        control,
        receiptFence: Object.freeze({
          receiptId: receipt.receiptId,
          ownerId: executionFence.owner.ownerId,
          token: executionFence.token,
        }),
      });
      stopCancellationObservation();
      await cancellationPersistence;
      if (result.toolCallId !== input.call.toolCallId) {
        throw new ToolExecutionCoordinationError(
          "Tool result identity does not match the controlled call.",
        );
      }
      const cancellation = cancellationObserved ? cancellationReference(input, receipt) : undefined;
      if (result.status === "succeeded") {
        const succeeded = await appendReceipt(
          input,
          receipt,
          "succeeded",
          isMeaningful ? "applied" : "none",
          {
            cancellation,
            reasonCode: cancellation ? "cancellation-requested-effect-completed" : undefined,
          },
        );
        return {
          status: "succeeded",
          result,
          receipt: succeeded.receipt,
          eventDelivery: mergeDelivery(delivery, succeeded.delivery),
        };
      }
      const failed = await appendReceipt(
        input,
        receipt,
        "failed_after_start",
        isMeaningful ? "unknown" : "none",
        {
          cancellation,
          reasonCode: cancellation
            ? "cancellation-requested-effect-unconfirmed"
            : "tool-reported-failure",
        },
      );
      return {
        status: "failed",
        result,
        receipt: failed.receipt,
        eventDelivery: mergeDelivery(delivery, failed.delivery),
      };
    } catch {
      stopCancellationObservation();
      await cancellationPersistence;
      try {
        const indeterminate = await appendReceipt(
          input,
          receipt,
          "indeterminate",
          isMeaningful ? "unknown" : "none",
          {
            cancellation: cancellationObserved ? cancellationReference(input, receipt) : undefined,
            reasonCode: cancellationObserved
              ? "cancellation-requested-execution-indeterminate"
              : "executor-threw-after-start",
          },
        );
        return {
          status: "indeterminate",
          receipt: indeterminate.receipt,
          eventDelivery: mergeDelivery(delivery, indeterminate.delivery),
        };
      } catch {
        return { status: "indeterminate", receipt, eventDelivery: delivery };
      }
    }
  } finally {
    stopCancellationObservation();
    try {
      await lease.release();
    } catch {
      // Lease cleanup cannot overwrite an authoritative durable outcome.
    }
  }
};
