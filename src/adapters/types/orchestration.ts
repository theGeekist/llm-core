import type { MaybePromise } from "../../maybe";
import type { AdapterTraceEvent, ResumeSnapshot } from "./core";

export type CheckpointStore = {
  get: (token: unknown) => MaybePromise<ResumeSnapshot | undefined>;
  set: (token: unknown, snapshot: ResumeSnapshot, ttlMs?: number) => MaybePromise<boolean | null>;
  delete: (token: unknown) => MaybePromise<boolean | null>;
  touch?: (token: unknown, ttlMs?: number) => MaybePromise<boolean | null>;
  sweep?: () => MaybePromise<boolean | null>;
};

export type InterruptStrategy = {
  mode: "continue" | "restart";
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type EventStreamEvent = AdapterTraceEvent;

export type EventStream = {
  emit: (event: EventStreamEvent) => MaybePromise<boolean | null>;
  emitMany?: (events: EventStreamEvent[]) => MaybePromise<boolean | null>;
};
