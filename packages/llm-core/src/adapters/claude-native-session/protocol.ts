import type { JsonValue } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export interface ClaudeStreamEvent {
  readonly type: string;
  readonly [key: string]: JsonValue | undefined;
}

export interface ClaudeNativeSessionCommand {
  readonly prompt: string;
  readonly sessionId?: string;
  readonly options?: Readonly<Record<string, JsonValue>>;
}

/**
 * The composition root pre-assigns sessionId so the inbox socket can be configured
 * before the process starts emitting events.
 */
export interface ClaudeNativeSessionProcess {
  readonly sessionId: string;
  readonly events: AsyncIterable<ClaudeStreamEvent>;
  cancel(): MaybePromise<void>;
}

/** Process ownership and transport are supplied by the application composition root. */
export interface ClaudeNativeSessionClient {
  spawn(command: ClaudeNativeSessionCommand): MaybePromise<ClaudeNativeSessionProcess>;
}
