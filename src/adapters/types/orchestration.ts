import type { MaybePromise } from "../../maybe";
import type { EventStream, EventStreamEvent, ResumeSnapshot } from "./core";

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

export type { EventStreamEvent, EventStream };
