import type { ConcurrencyLease, ConcurrencyRequest } from "../../features/control/runtime";
import type { ToolExecutionControl } from "../../features/tooling/orchestration";
import type { ExecuteControlledToolInput } from "./types";

export const createExecutionControl = (supplied?: ToolExecutionControl): ToolExecutionControl =>
  supplied ?? {
    isCancellationRequested: () => false,
    onCancellationRequested: () => () => undefined,
  };

export const leaseMatches = (actual: ConcurrencyLease, expected: ConcurrencyRequest): boolean =>
  actual.request.runId === expected.runId &&
  actual.request.toolCallId === expected.toolCallId &&
  actual.request.mode === expected.mode;

export const acquireInterruptibly = async (
  input: ExecuteControlledToolInput,
  request: ConcurrencyRequest,
  control: ToolExecutionControl,
): Promise<ConcurrencyLease | null> => {
  if (control.isCancellationRequested()) return null;
  return new Promise<ConcurrencyLease | null>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => undefined;
    const handleCancellation = (): void => {
      if (!settled) {
        settled = true;
        try {
          unsubscribe();
        } catch {
          // Cancellation remains authoritative over host cleanup.
        }
        resolve(null);
      }
    };
    unsubscribe = control.onCancellationRequested(handleCancellation);
    if (control.isCancellationRequested()) handleCancellation();
    void input.concurrency.acquire(request).then(
      async (lease) => {
        if (settled) {
          try {
            await lease.release();
          } catch {
            // Late lease cleanup cannot change the durable cancellation fact.
          }
          return;
        }
        settled = true;
        try {
          unsubscribe();
        } catch {
          // Lease ownership is established; callback cleanup is best-effort.
        }
        resolve(lease);
      },
      (error: unknown) => {
        if (!settled) {
          settled = true;
          try {
            unsubscribe();
          } catch {
            // Rejection remains authoritative over callback cleanup.
          }
          reject(error);
        }
      },
    );
  });
};

export const isExpired = (expiresAt: string | undefined, now: string): boolean =>
  expiresAt !== undefined &&
  (!Number.isFinite(Date.parse(expiresAt)) ||
    !Number.isFinite(Date.parse(now)) ||
    Date.parse(now) >= Date.parse(expiresAt));
