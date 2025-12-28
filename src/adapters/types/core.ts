import type { MaybePromise } from "../../maybe";

export type AdapterRequirement =
  | { kind: "construct"; name: string }
  | { kind: "capability"; name: string };

export type AdapterMetadata = {
  requires?: AdapterRequirement[];
  [key: string]: unknown;
};

export type AdapterDiagnostic = {
  level: "warn" | "error";
  message: string;
  data?: unknown;
};

export type PauseKind = "human" | "external" | "system";

export type ResumeSnapshot = {
  token: unknown;
  pauseKind?: PauseKind;
  createdAt: number;
  lastAccessedAt?: number;
  payload?: unknown;
};

export type AdapterCallContext = {
  report?: (diagnostic: AdapterDiagnostic) => void;
};

type TraceIdentity = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

export type AdapterTraceEvent = TraceIdentity & {
  name: string;
  data?: Record<string, unknown>;
};

export type AdapterTraceSink = {
  emit(event: AdapterTraceEvent): MaybePromise<boolean | null>;
  emitMany?(events: AdapterTraceEvent[]): MaybePromise<boolean | null>;
};
