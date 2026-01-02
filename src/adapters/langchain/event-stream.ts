import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { EventStream } from "../types";
import { createEventStreamFromTraceSink } from "../primitives/event-stream";
import { fromLangChainCallbackHandler } from "./trace";

const toEventStream = (handler: BaseCallbackHandler): EventStream =>
  createEventStreamFromTraceSink(fromLangChainCallbackHandler(handler));

export const fromLangChainEventStream = (handler: BaseCallbackHandler): EventStream =>
  toEventStream(handler);
