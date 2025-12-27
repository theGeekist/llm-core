import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { AdapterTraceSink, EventStream } from "../types";
import { createEventStreamFromTraceSink } from "../primitives/event-stream";
import { fromLangChainCallbackHandler } from "./trace";

const toTraceSink = (handler: BaseCallbackHandler): AdapterTraceSink =>
  fromLangChainCallbackHandler(handler);

const toEventStream = (handler: BaseCallbackHandler): EventStream =>
  createEventStreamFromTraceSink(toTraceSink(handler));

export const fromLangChainEventStream = (handler: BaseCallbackHandler): EventStream =>
  toEventStream(handler);
