import type {
  ChatAdapter,
  ChatAdapterExtras,
  StreamingAdapterObserver,
} from "@nlux/core";
import type { InvocationContext, JsonValue } from "#contracts";
import {
  projectInteractionEvent,
  type InteractionEvent,
  type InteractionSession,
  type InteractionUiEvent,
} from "../../application/interaction/public";
import type { UiProjectionMapper } from "./types";

export type NluxProjectionSignal =
  | { readonly type: "next"; readonly chunk: string }
  | { readonly type: "complete" }
  | { readonly type: "error"; readonly error: Error };

export interface NluxInteractionAdapterOptions {
  readonly session: InteractionSession;
  readonly invocationContext: (extras: ChatAdapterExtras<string>) => InvocationContext;
  readonly mapInput?: (
    message: string,
    extras: ChatAdapterExtras<string>,
  ) => JsonValue;
}

const mapProjection = (event: InteractionUiEvent): readonly NluxProjectionSignal[] => {
  switch (event.kind) {
    case "text-delta":
      return [{ type: "next", chunk: event.text }];
    case "message-finished":
      return [{ type: "complete" }];
    case "message-failed":
      return [{ type: "error", error: new Error(event.reasonCode) }];
    default:
      return [];
  }
};

export const createNluxProjectionMapper = (): UiProjectionMapper<NluxProjectionSignal> =>
  (event: InteractionEvent) => {
    const projected = projectInteractionEvent(event);
    return projected ? mapProjection(projected) : [];
  };

const deliverSignals = (
  observer: StreamingAdapterObserver<string>,
  signals: readonly NluxProjectionSignal[],
): boolean => {
  let terminal = false;
  for (const signal of signals) {
    if (signal.type === "next") {
      observer.next(signal.chunk);
    } else if (signal.type === "complete") {
      observer.complete();
      terminal = true;
    } else {
      observer.error(signal.error);
      terminal = true;
    }
  }
  return terminal;
};

export const createNluxChatAdapter = (
  options: NluxInteractionAdapterOptions,
): ChatAdapter<string> => {
  const map = createNluxProjectionMapper();
  return {
    streamText(message, observer, extras) {
      void (async () => {
        let terminal = false;
        try {
          const run = await options.session.send({
            input: options.mapInput?.(message, extras) ?? message,
            invocationContext: options.invocationContext(extras),
          });
          for await (const event of run.events()) {
            terminal = deliverSignals(observer, map(event)) || terminal;
          }
          await run.result();
          if (!terminal) {
            observer.complete();
          }
        } catch (error) {
          observer.error(error instanceof Error ? error : new Error("Interaction failed."));
        }
      })();
    },
    async batchText(message, extras) {
      const run = await options.session.send({
        input: options.mapInput?.(message, extras) ?? message,
        invocationContext: options.invocationContext(extras),
      });
      let text = "";
      for await (const event of run.events()) {
        for (const signal of map(event)) {
          if (signal.type === "next") {
            text += signal.chunk;
          } else if (signal.type === "error") {
            throw signal.error;
          }
        }
      }
      await run.result();
      return text;
    },
  };
};
