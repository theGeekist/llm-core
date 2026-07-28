import type { AdapterMetadata, AdapterRequest } from "./core";
import type { MessageRole } from "./messages";
import type { MaybePromise } from "#shared/maybe";

export type Turn = {
  role: MessageRole;
  content: string;
  timestamp?: number;
  metadata?: AdapterMetadata;
};

export type Thread = {
  id: string;
  turns: Turn[];
  metadata?: AdapterMetadata;
};

export type Memory = {
  append?(request: AdapterRequest<{ threadId: string; turn: Turn }>): MaybePromise<boolean | null>;
  load?(
    request: AdapterRequest<{ input: Record<string, unknown> }>,
  ): MaybePromise<Record<string, unknown>>;
  read?(request: AdapterRequest<{ threadId: string }>): MaybePromise<Thread | null>;
  reset?(request: AdapterRequest): MaybePromise<boolean | null>;
  save?(
    request: AdapterRequest<{
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>,
  ): MaybePromise<boolean | null>;
  summarize?(request: AdapterRequest<{ threadId: string }>): MaybePromise<string | null>;
  metadata?: AdapterMetadata;
};
