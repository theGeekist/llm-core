import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { MessageRole } from "./messages";
import type { MaybePromise } from "../../maybe";

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
  append?(threadId: string, turn: Turn, context?: AdapterCallContext): MaybePromise<void>;
  load?(
    input: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<Record<string, unknown>>;
  read?(threadId: string, context?: AdapterCallContext): MaybePromise<Thread | undefined>;
  reset?(context?: AdapterCallContext): MaybePromise<void>;
  save?(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<void>;
  summarize?(threadId: string, context?: AdapterCallContext): MaybePromise<string>;
};
