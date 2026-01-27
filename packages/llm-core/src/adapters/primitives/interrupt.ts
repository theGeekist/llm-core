import type { InterruptStrategy } from "../types";

export const createInterruptStrategy = (
  mode: InterruptStrategy["mode"],
  reason?: string,
  metadata?: Record<string, unknown>,
): InterruptStrategy => ({
  mode,
  reason,
  metadata,
});
