import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import type { AdapterTraceEvent, EventStream } from "../types";
import { bindFirst, maybeMap, maybeAll } from "../../shared/maybe";
import { isRecord } from "../utils";

type LangChainTraceMetadata = {
  modelId?: string | null;
  timestamp?: number | null;
};

const WORKFLOW_SERIALIZED: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["llm-core", "workflow"],
  name: "workflow",
};

function toRunId(event: AdapterTraceEvent) {
  return event.id ?? "adapter-trace";
}

function toTraceMetadata(event: AdapterTraceEvent): LangChainTraceMetadata | null {
  if (!event.modelId && !event.timestamp) {
    return null;
  }
  return {
    modelId: event.modelId ?? null,
    timestamp: event.timestamp ?? null,
  };
}

function canHandleCustomEvent(handler: BaseCallbackHandler): handler is BaseCallbackHandler & {
  handleCustomEvent: (
    eventName: string,
    data: unknown,
    runId: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ) => unknown;
} {
  return typeof handler.handleCustomEvent === "function";
}

function canHandleChainStart(handler: BaseCallbackHandler): handler is BaseCallbackHandler & {
  handleChainStart: (chain: Serialized, inputs: Record<string, unknown>, runId: string) => unknown;
} {
  return typeof handler.handleChainStart === "function";
}

function canHandleChainEnd(handler: BaseCallbackHandler): handler is BaseCallbackHandler & {
  handleChainEnd: (outputs: Record<string, unknown>, runId: string) => unknown;
} {
  return typeof handler.handleChainEnd === "function";
}

function canHandleChainError(handler: BaseCallbackHandler): handler is BaseCallbackHandler & {
  handleChainError: (error: unknown, runId: string) => unknown;
} {
  return typeof handler.handleChainError === "function";
}

function canHandleLLMEnd(handler: BaseCallbackHandler): handler is BaseCallbackHandler & {
  handleLLMEnd: (output: LLMResult, runId: string) => unknown;
} {
  return typeof handler.handleLLMEnd === "function";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  if (value === undefined) {
    return {};
  }
  return { data: value };
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (value === undefined) {
    return new Error("Unknown error");
  }
  return new Error(String(value));
}

function toErrorFromEvent(event: AdapterTraceEvent): Error {
  if (isRecord(event.data) && event.data.error instanceof Error) {
    return event.data.error;
  }
  if (isRecord(event.data) && event.data.error !== undefined) {
    return toError(event.data.error);
  }
  return toError(event.data);
}

function toLLMResult(event: AdapterTraceEvent): LLMResult {
  return {
    generations: [[]],
    llmOutput: toRecord(event.data),
  };
}

function emitTraceEvent(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (!canHandleCustomEvent(handler)) {
    return null;
  }
  const metadata = toTraceMetadata(event);
  return handler.handleCustomEvent(
    event.name,
    event.data,
    toRunId(event),
    undefined,
    metadata ?? undefined,
  );
}

function emitChainStart(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (!canHandleChainStart(handler)) {
    return null;
  }
  return handler.handleChainStart(WORKFLOW_SERIALIZED, toRecord(event.data), toRunId(event));
}

function emitChainEnd(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (!canHandleChainEnd(handler)) {
    return null;
  }
  return handler.handleChainEnd(toRecord(event.data), toRunId(event));
}

function emitChainError(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (!canHandleChainError(handler)) {
    return null;
  }
  return handler.handleChainError(toErrorFromEvent(event), toRunId(event));
}

function emitLlmEnd(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (!canHandleLLMEnd(handler)) {
    return null;
  }
  return handler.handleLLMEnd(toLLMResult(event), toRunId(event));
}

function readRunStatus(event: AdapterTraceEvent): string | null {
  if (isRecord(event.data) && typeof event.data.status === "string") {
    return event.data.status;
  }
  return null;
}

function emitRunEnd(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  const status = readRunStatus(event);
  if (status === "error") {
    return emitChainError(handler, event);
  }
  return emitChainEnd(handler, event);
}

function emitLifecycleEvent(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  if (event.name === "run.start") {
    return emitChainStart(handler, event);
  }
  if (event.name === "provider.response") {
    return emitLlmEnd(handler, event);
  }
  if (event.name === "run.end") {
    return emitRunEnd(handler, event);
  }
  return null;
}

const isFailure = (value: boolean | null) => value === false;
const isUnknown = (value: boolean | null) => value === null;
const combineResults = (values: Array<boolean | null>) => {
  if (values.some(isFailure)) {
    return false;
  }
  if (values.some(isUnknown)) {
    return null;
  }
  return true;
};

function emitTracePair(handler: BaseCallbackHandler, event: AdapterTraceEvent) {
  return maybeMap(
    combineResults,
    maybeAll([emitTraceEvent(handler, event), emitLifecycleEvent(handler, event)]),
  );
}

function emitTraceEvents(handler: BaseCallbackHandler, events: AdapterTraceEvent[]) {
  const emit = bindFirst(emitTracePair, handler);
  return maybeMap(combineResults, maybeAll(events.map(emit)));
}

export function fromLangChainCallbackHandler(handler: BaseCallbackHandler): EventStream {
  const emit = bindFirst(emitTracePair, handler);
  const emitMany = bindFirst(emitTraceEvents, handler);
  return {
    emit,
    emitMany,
  };
}
