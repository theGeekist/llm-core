import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { MessageRole } from "./messages";
import type { MaybePromise } from "../../shared/maybe";

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
  append?(threadId: string, turn: Turn, context?: AdapterCallContext): MaybePromise<boolean | null>;
  load?(
    input: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<Record<string, unknown>>;
  read?(threadId: string, context?: AdapterCallContext): MaybePromise<Thread | null>;
  reset?(context?: AdapterCallContext): MaybePromise<boolean | null>;
  save?(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<boolean | null>;
  summarize?(threadId: string, context?: AdapterCallContext): MaybePromise<string | null>;
  metadata?: AdapterMetadata;
};
