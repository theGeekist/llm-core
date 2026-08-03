import { reservationKeysEqual } from "../../features/evidence/runtime";
import {
  bindAction,
  isRegisteredExecutableTool,
  rebindValidatedToolCall,
} from "../../features/tooling/orchestration";
import { authorizeExecution } from "./authorization";
import { createExecutionControl } from "./execution-control";
import { project, reservationEvent } from "./event-projection";
import {
  assertReceiptIdentity,
  DEFAULT_REDACTION,
  existingOutcome,
  meaningfulEffect,
  mintedId,
  requireRunId,
  verifySpecification,
} from "./execution-invariants";
import { invokeExecution } from "./invocation";
import { cancelBeforeStart } from "./receipt-persistence";
import type {
  ControlledExecutionPhase,
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "./types";
import { ToolExecutionCoordinationError } from "./types";

type PreparationResult =
  | { kind: "prepared"; phase: ControlledExecutionPhase }
  | { kind: "outcome"; outcome: ControlledToolExecutionOutcome };

const prepareExecution = async (
  originalInput: ExecuteControlledToolInput,
): Promise<PreparationResult> => {
  await verifySpecification(originalInput);
  if (!isRegisteredExecutableTool(originalInput.tool)) {
    throw new TypeError("Controlled tool execution requires a registered ExecutableTool.");
  }
  const validatedCall = await originalInput.tool.validate({ call: originalInput.call });
  let input = { ...originalInput, call: validatedCall };
  const requestedRunId = requireRunId(input);
  const effectClass = input.tool.definition.effect.class;
  const isMeaningful = meaningfulEffect(effectClass);
  if (isMeaningful && !input.call.idempotencyKey) {
    throw new ToolExecutionCoordinationError(
      "Meaningful effects require an explicit idempotency key.",
    );
  }
  const bound = await bindAction({
    definition: input.tool.definition,
    call: input.call,
    securityDomain: input.securityDomain,
    keyRef: input.digestKeyRef,
    digestPort: input.digestPort,
  });
  await verifySpecification(input, bound);
  const reserveRequest = {
    receiptId: mintedId(input.facts.newReceiptId(), "Tool receipt"),
    key: {
      securityDomain: input.securityDomain,
      tenantId: input.call.invocation.tenant?.tenantId,
      toolId: input.call.toolId,
      toolVersion: input.call.toolVersion,
      idempotencyKey: input.call.idempotencyKey ?? `tool-call:${input.call.toolCallId}`,
    },
    actionDigest: bound.digest,
    effectClass,
    runId: requestedRunId,
    stepId: input.call.invocation.stepId,
    toolCallId: input.call.toolCallId,
    redaction: input.redaction ?? DEFAULT_REDACTION,
  };
  const reservation = await input.journal.reserve(reserveRequest);
  if (reservation.kind === "conflict") {
    return {
      kind: "outcome",
      outcome: { status: "conflict", existingReceiptId: reservation.existingReceiptId },
    };
  }
  assertReceiptIdentity(
    reservation.receipt,
    reservation.kind === "created"
      ? {
          runId: requestedRunId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        }
      : { actionDigest: bound.digest },
  );
  if (
    !reservationKeysEqual(reservation.receipt.key, reserveRequest.key) ||
    (reservation.kind === "created" &&
      (reservation.receipt.receiptId !== reserveRequest.receiptId ||
        reservation.receipt.state !== "reserved" ||
        reservation.receipt.revision !== 0))
  ) {
    throw new ToolExecutionCoordinationError(
      "Receipt journal acknowledged a mismatched reservation.",
    );
  }
  const replay = reservation.kind === "existing" ? existingOutcome(reservation.receipt) : null;
  if (replay) return { kind: "outcome", outcome: replay };
  if (reservation.kind === "existing") {
    input = {
      ...input,
      call: rebindValidatedToolCall({
        tool: input.tool,
        call: input.call,
        toolCallId: reservation.receipt.toolCallId,
        runId: reservation.receipt.runId,
        ...(reservation.receipt.stepId === undefined ? {} : { stepId: reservation.receipt.stepId }),
      }),
    };
  }
  return {
    kind: "prepared",
    phase: {
      input,
      bound,
      receipt: reservation.receipt,
      delivery:
        reservation.kind === "created"
          ? project(input.eventSink, reservationEvent(input, reservation.receipt))
          : "not-configured",
      control: createExecutionControl(input.executionControl),
      isMeaningful,
    },
  };
};

export const executeControlledTool = async (
  input: ExecuteControlledToolInput,
): Promise<ControlledToolExecutionOutcome> => {
  const preparation = await prepareExecution(input);
  if (preparation.kind === "outcome") return preparation.outcome;
  if (preparation.phase.control.isCancellationRequested()) {
    return cancelBeforeStart(
      preparation.phase.input,
      preparation.phase.receipt,
      preparation.phase.delivery,
    );
  }
  const authorization = await authorizeExecution(preparation.phase);
  if (authorization.kind === "outcome") return authorization.outcome;
  return invokeExecution(authorization.phase);
};

export { reconcileControlledToolReceipt } from "./receipt-reconciliation";
