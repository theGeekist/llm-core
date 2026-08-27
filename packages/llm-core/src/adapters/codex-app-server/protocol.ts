import type { JsonValue } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export type CodexAppServerMethod =
  | "thread/start"
  | "thread/resume"
  | "turn/start"
  | "turn/steer"
  | "turn/interrupt";

export interface CodexAppServerRequest {
  readonly method: CodexAppServerMethod;
  readonly params: Readonly<Record<string, JsonValue>>;
}

export interface CodexAppServerNotification {
  readonly method: string;
  readonly params: JsonValue;
}

/** Process ownership and transport are supplied by the application composition root. */
export interface CodexAppServerClient {
  request(request: CodexAppServerRequest): MaybePromise<JsonValue>;
  notifications(threadId: string): AsyncIterable<CodexAppServerNotification>;
}
