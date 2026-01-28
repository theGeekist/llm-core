import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { EventStream } from "../types";
import { createEventStreamFromTraceSink } from "../primitives/event-stream";
import { fromLangChainCallbackHandler } from "./trace";
import { compose } from "#shared/fp";

export const fromLangChainEventStream: (handler: BaseCallbackHandler) => EventStream = compose(
  createEventStreamFromTraceSink,
  fromLangChainCallbackHandler,
);
