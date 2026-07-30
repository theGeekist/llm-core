import type { RunId, ToolCallId } from "#contracts";
import type { ExecutionConcurrency } from "../tooling/public";
import type { ControlMaybePromise } from "./shared";

export interface ConcurrencyRequest {
  runId: RunId;
  toolCallId: ToolCallId;
  mode: ExecutionConcurrency;
}

/**
 * Live process-local lease. It is intentionally not a portable wire contract.
 */
export interface ConcurrencyLease {
  request: ConcurrencyRequest;
  release(): ControlMaybePromise<void>;
}

/**
 * Live scheduler boundary used by application orchestration.
 */
export interface ConcurrencyGate {
  acquire(request: ConcurrencyRequest): Promise<ConcurrencyLease>;
}

type PendingRequest = {
  request: ConcurrencyRequest;
  resolve: (lease: ConcurrencyLease) => void;
};

type SchedulerState = {
  activeShared: number;
  activeExclusive: boolean;
  queue: PendingRequest[];
};

const canAcquire = (state: SchedulerState, mode: ExecutionConcurrency): boolean =>
  mode === "exclusive"
    ? !state.activeExclusive && state.activeShared === 0
    : !state.activeExclusive;

const activate = (
  state: SchedulerState,
  request: ConcurrencyRequest,
  drain: () => void,
): ConcurrencyLease => {
  if (request.mode === "exclusive") {
    state.activeExclusive = true;
  } else {
    state.activeShared += 1;
  }
  let released = false;
  return {
    request,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      if (request.mode === "exclusive") {
        state.activeExclusive = false;
      } else {
        state.activeShared -= 1;
      }
      drain();
    },
  };
};

export const createConcurrencyGate = (): ConcurrencyGate => {
  const state: SchedulerState = {
    activeShared: 0,
    activeExclusive: false,
    queue: [],
  };

  const drain = (): void => {
    const first = state.queue[0];
    if (!first || !canAcquire(state, first.request.mode)) {
      return;
    }
    if (first.request.mode === "exclusive") {
      state.queue.shift();
      first.resolve(activate(state, first.request, drain));
      return;
    }
    while (state.queue[0]?.request.mode === "shared" && !state.activeExclusive) {
      const shared = state.queue.shift();
      if (shared) {
        shared.resolve(activate(state, shared.request, drain));
      }
    }
  };

  return {
    acquire: (request) =>
      new Promise<ConcurrencyLease>((resolve) => {
        state.queue.push({ request, resolve });
        drain();
      }),
  };
};
