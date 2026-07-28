import type { EventStream, EventStreamEvent } from "./core";

export type InterruptStrategy = {
  mode: "continue" | "restart";
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type { EventStreamEvent, EventStream };
