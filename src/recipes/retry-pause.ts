import type { HelperApplyResult } from "@wpkernel/pipeline/core";
import type { PipelineState } from "#workflow/types";
import type { InterruptStrategy } from "#adapters/types";
import type { PauseKind } from "#adapters/types";
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
};

export type PausedStepResult = HelperApplyResult<PipelineState> & {
  paused: true;
  pauseKind: PauseKind;
  token: unknown;
  pauseSnapshot: RetryPauseSnapshot;
  partialArtefact: PipelineState;
  __interrupt: InterruptStrategy;
};

type RetryPauseState = {
  paused: true;
  token: unknown;
  pauseKind: PauseKind;
  retry: RetryPausePayload;
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
});

const buildRetryPauseState = (payload: RetryPausePayload, token: unknown): RetryPauseState => ({
  paused: true,
  token,
  pauseKind: "system" satisfies PauseKind,
  retry: payload,
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

export const toRetryPauseResult = (input: RetryPauseResultInput): PausedStepResult => {
  const token = createRetryPauseToken();
  const pauseState = buildRetryPauseState(input.payload, token);
  input.state.__pause = pauseState;
  return {
    output: input.state,
    paused: true,
    pauseKind: pauseState.pauseKind,
    token,
    pauseSnapshot: buildRetryPauseSnapshot(input.payload, input.input, input.spec),
    partialArtefact: input.state,
    __interrupt: buildRetryPauseInterrupt(input.payload),
  };
};
