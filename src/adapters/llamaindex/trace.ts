import type { AdapterTraceEvent, AdapterTraceSink } from "../types";
import {
  createHandlerDecorator,
  type TracePlugin,
} from "@llamaindex/workflow-core/middleware/trace-events";
import { bindFirst, chainMaybe, fromPromiseLike, mapMaybe, tryMaybe } from "../../maybe";
import { isRecord, readString } from "../utils";

type TraceDecoratorConfig = Parameters<typeof createHandlerDecorator>[0];
type WorkflowHandler = Parameters<TraceDecoratorConfig["onBeforeHandler"]>[0];
type HandlerContext = Parameters<TraceDecoratorConfig["onBeforeHandler"]>[1];

const toUndefined = () => undefined;

const emitTrace = (sink: AdapterTraceSink, event: AdapterTraceEvent) =>
  mapMaybe(fromPromiseLike(sink.emit(event)), toUndefined);

const readHandlerName = (context: HandlerContext): string | undefined => {
  const handler = context.handler;
  if (typeof handler === "function") {
    return readString(handler.name);
  }
  return undefined;
};

const readContextArraySize = (value: unknown): number | undefined =>
  Array.isArray(value) ? value.length : undefined;

const toContextData = (context: HandlerContext) => {
  const handlerName = readHandlerName(context);
  const inputs = readContextArraySize(context.inputs);
  const inputEvents = readContextArraySize(context.inputEvents);
  const outputs = readContextArraySize(context.outputs);
  return {
    handler: handlerName,
    inputs,
    inputEvents,
    outputs,
  };
};

const toContextRecord = (value: unknown): HandlerContext =>
  isRecord(value) ? (value as HandlerContext) : ({} as HandlerContext);

const toStartEvent = (context: HandlerContext): AdapterTraceEvent => ({
  name: "workflow.handler.start",
  data: toContextData(context),
});

const toEndEvent = (context: HandlerContext): AdapterTraceEvent => ({
  name: "workflow.handler.end",
  data: toContextData(context),
});

const toErrorEvent = (context: HandlerContext, error: unknown): AdapterTraceEvent => ({
  name: "workflow.handler.error",
  data: {
    ...toContextData(context),
    error,
  },
});

const emitStart = (sink: AdapterTraceSink, context: HandlerContext) =>
  emitTrace(sink, toStartEvent(context));

const emitEnd = (sink: AdapterTraceSink, context: HandlerContext) =>
  emitTrace(sink, toEndEvent(context));

const emitError = (sink: AdapterTraceSink, context: HandlerContext, error: unknown) =>
  emitTrace(sink, toErrorEvent(context, error));

type HandlerInvocation = {
  sink: AdapterTraceSink;
  context: HandlerContext;
  handler: WorkflowHandler;
  args: Parameters<WorkflowHandler>;
};

const buildInvocation = (
  sink: AdapterTraceSink,
  context: HandlerContext,
  handler: WorkflowHandler,
  args: Parameters<WorkflowHandler>,
): HandlerInvocation => ({
  sink,
  context,
  handler,
  args,
});

const invokeHandler = (invocation: HandlerInvocation) =>
  invocation.handler(...invocation.args) as ReturnType<WorkflowHandler>;

const emitEndForInvocation = (
  invocation: HandlerInvocation,
  value: ReturnType<WorkflowHandler>,
) => {
  void value;
  return emitEnd(invocation.sink, invocation.context);
};

const raiseError = <T>(error: unknown): T => {
  throw error;
};

const emitErrorForInvocation = (invocation: HandlerInvocation, error: unknown) =>
  chainMaybe(
    emitError(invocation.sink, invocation.context, error),
    bindFirst(raiseError<ReturnType<WorkflowHandler>>, error),
  );

const runAfterStart = (invocation: HandlerInvocation) =>
  mapMaybe(
    tryMaybe(bindFirst(invokeHandler, invocation), bindFirst(emitErrorForInvocation, invocation)),
    bindFirst(emitEndForInvocation, invocation),
  );

const runWithTrace = (invocation: HandlerInvocation) =>
  chainMaybe(emitStart(invocation.sink, invocation.context), bindFirst(runAfterStart, invocation));

const runHandlerWithArgs = (
  sink: AdapterTraceSink,
  context: HandlerContext,
  handler: WorkflowHandler,
  ...args: Parameters<WorkflowHandler>
): ReturnType<WorkflowHandler> =>
  runWithTrace(buildInvocation(sink, context, handler, args)) as ReturnType<WorkflowHandler>;

const wrapHandler = (
  sink: AdapterTraceSink,
  context: HandlerContext,
  handler: WorkflowHandler,
): WorkflowHandler =>
  bindFirst(bindFirst(bindFirst(runHandlerWithArgs, sink), context), handler) as WorkflowHandler;

const onBeforeHandler = (
  sink: AdapterTraceSink,
  handler: WorkflowHandler,
  handlerContext: HandlerContext,
  metadata: unknown,
) => {
  void metadata;
  return wrapHandler(sink, toContextRecord(handlerContext), handler);
};

const onAfterHandler = <T>(metadata: T) => metadata;

const createInitialValue = () => ({});

const createTraceDecoratorConfig = (sink: AdapterTraceSink) => ({
  debugLabel: "llamaindex.trace",
  getInitialValue: createInitialValue,
  onBeforeHandler: bindFirst(onBeforeHandler, sink),
  onAfterHandler,
});

const createTraceDecorator = (sink: AdapterTraceSink) =>
  createHandlerDecorator(createTraceDecoratorConfig(sink));

export const fromLlamaIndexTraceSink = (sink: AdapterTraceSink): TracePlugin =>
  createTraceDecorator(sink);
