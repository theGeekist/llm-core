import type { MaybePromise } from "../../maybe";
import type { AdapterTraceEvent, ResumeSnapshot } from "./core";

export type CheckpointStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<void>;
  delete: (token: unknown) => MaybePromise<void>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<void>;
  sweep?: () => MaybePromise<void>;
};

export type InterruptStrategy = {
  mode: "continue" | "restart";
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type EventStreamEvent = AdapterTraceEvent;

export type EventStream = {
  emit: (event: EventStreamEvent) => MaybePromise<void>;
  emitMany?: (events: EventStreamEvent[]) => MaybePromise<void>;
};
