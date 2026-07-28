import type { HelperApplyResult } from "@wpkernel/pipeline/core";
import type { PipelineState } from "#workflow/types";
import type { InterruptStrategy, PauseKind } from "#adapters/types";
import type { RetryPausePayload } from "#workflow/runtime/retry";
import { createInterruptStrategy } from "#adapters/primitives/interrupt";

export type RetryPauseSpec = {
  name: string;
  label?: string;
  kind?: string;
};

export type RetryPauseSnapshot = RetryPausePayload & {
  kind: "retry";
  input: unknown;
  step?: RetryPauseSpec;
  interrupt: InterruptStrategy;
};

const createRetryPauseToken = () => {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.randomUUID) {
    return `retry:${cryptoRef.randomUUID()}`;
  }
  return `retry:${Date.now()}`;
};

const buildRetryPauseSnapshot = (
  payload: RetryPausePayload,
  input: unknown,
  spec: RetryPauseSpec,
): RetryPauseSnapshot => ({
  kind: "retry",
  ...payload,
  input,
  step: spec,
  interrupt: buildRetryPauseInterrupt(payload),
});

const buildRetryPauseInterrupt = (payload: RetryPausePayload) =>
  createInterruptStrategy("restart", "retry", {
    adapterKind: payload.adapterKind,
    method: payload.method,
  });

type RetryPauseResultInput = {
  state: PipelineState;
  input: unknown;
  spec: RetryPauseSpec;
  payload: RetryPausePayload;
};

export const toRetryPauseResult = (
  input: RetryPauseResultInput,
): HelperApplyResult<PipelineState> => {
  const token = createRetryPauseToken();
  input.state.__pause = {
    token,
    pauseKind: "system" satisfies PauseKind,
    payload: buildRetryPauseSnapshot(input.payload, input.input, input.spec),
  };
  return { output: input.state };
};
