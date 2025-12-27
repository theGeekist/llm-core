import type { InterruptStrategy } from "../types";
import { createInterruptStrategy } from "../primitives/interrupt";

export type LangGraphInterruptOptions = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULT_REASON = "langgraph.interrupt";
const DEFAULT_METADATA = { source: "langgraph" };

const buildMetadata = (metadata?: Record<string, unknown>) =>
  metadata ? { ...DEFAULT_METADATA, ...metadata } : DEFAULT_METADATA;

export const fromLangGraphInterrupt = (options?: LangGraphInterruptOptions): InterruptStrategy =>
  createInterruptStrategy(
    "restart",
    options?.reason ?? DEFAULT_REASON,
    buildMetadata(options?.metadata),
  );
