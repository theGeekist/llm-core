import type { AdapterTraceEvent, EventStream } from "../types";
import {
  createHandlerDecorator,
  type TracePlugin,
} from "@llamaindex/workflow-core/middleware/trace-events";
import { bindFirst } from "#shared/fp";
import { maybeChain, maybeMap, maybeTap, maybeTry } from "#shared/maybe";
import { readString } from "../utils";
import { isRecord } from "#shared/guards";

type TraceDecoratorConfig = Parameters<typeof createHandlerDecorator>[0];
type WorkflowHandler = Parameters<TraceDecoratorConfig["onBeforeHandler"]>[0];
type HandlerContext = Parameters<TraceDecoratorConfig["onBeforeHandler"]>[1];

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);

const emitTrace = (sink: EventStream, event: AdapterTraceEvent) =>
  maybeMap(toBoolean, sink.emit(event));

const readHandlerName = (context: HandlerContext): string | null => {
  const handler = context.handler;
  if (typeof handler === "function") {
    return readString(handler.name);
  }
  return null;
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

const emitStart = (sink: EventStream, context: HandlerContext) =>
  emitTrace(sink, toStartEvent(context));

const emitEnd = (sink: EventStream, context: HandlerContext) =>
  emitTrace(sink, toEndEvent(context));

const emitError = (sink: EventStream, context: HandlerContext, error: unknown) =>
  emitTrace(sink, toErrorEvent(context, error));

type HandlerInvocation = {
  sink: EventStream;
  context: HandlerContext;
  handler: WorkflowHandler;
  args: Parameters<WorkflowHandler>;
};

type BuildInvocationInput = {
  sink: EventStream;
  context: HandlerContext;
  handler: WorkflowHandler;
  args: Parameters<WorkflowHandler>;
};

const buildInvocation = (input: BuildInvocationInput): HandlerInvocation => ({
  sink: input.sink,
  context: input.context,
  handler: input.handler,
  args: input.args,
});

const invokeHandler = (invocation: HandlerInvocation) =>
  invocation.handler(...invocation.args) as ReturnType<WorkflowHandler>;

const emitEndWithContext = (input: { sink: EventStream; context: HandlerContext }) =>
  emitEnd(input.sink, input.context);

const emitEndForInvocation = (
  invocation: HandlerInvocation,
  value: ReturnType<WorkflowHandler>,
) => {
  return maybeTap(
    bindFirst(emitEndWithContext, { sink: invocation.sink, context: invocation.context }),
    value,
  );
};

const raiseError = <T>(error: unknown): T => {
  throw error;
};

const emitErrorForInvocation = (invocation: HandlerInvocation, error: unknown) =>
  maybeChain(
    bindFirst(raiseError<ReturnType<WorkflowHandler>>, error),
    emitError(invocation.sink, invocation.context, error),
  );

const runAfterStart = (invocation: HandlerInvocation) =>
  maybeMap(
    bindFirst(emitEndForInvocation, invocation),
    maybeTry(bindFirst(emitErrorForInvocation, invocation), bindFirst(invokeHandler, invocation)),
  );

const runWithTrace = (invocation: HandlerInvocation) =>
  maybeChain(bindFirst(runAfterStart, invocation), emitStart(invocation.sink, invocation.context));

const runHandlerWithArgs = (
  input: { sink: EventStream; context: HandlerContext; handler: WorkflowHandler },
  ...args: Parameters<WorkflowHandler>
): ReturnType<WorkflowHandler> =>
  runWithTrace(buildInvocation({ ...input, args })) as ReturnType<WorkflowHandler>;

const wrapHandler = (
  sink: EventStream,
  context: HandlerContext,
  handler: WorkflowHandler,
): WorkflowHandler => bindFirst(runHandlerWithArgs, { sink, context, handler }) as WorkflowHandler;

type BeforeHandlerArgs = Parameters<TraceDecoratorConfig["onBeforeHandler"]>;

const onBeforeHandler = (input: { sink: EventStream }, ...args: BeforeHandlerArgs) => {
  const [handler, handlerContext, metadata] = args;
  void metadata;
  return wrapHandler(input.sink, toContextRecord(handlerContext), handler);
};

const onAfterHandler = <T>(metadata: T) => metadata;

const createInitialValue = () => ({});

const createTraceDecoratorConfig = (sink: EventStream) => ({
  debugLabel: "llamaindex.trace",
  getInitialValue: createInitialValue,
  onBeforeHandler: bindFirst(onBeforeHandler, { sink }),
  onAfterHandler,
});

const createTraceDecorator = (sink: EventStream) =>
  createHandlerDecorator(createTraceDecoratorConfig(sink));

export const fromLlamaIndexTraceSink = (sink: EventStream): TracePlugin =>
  createTraceDecorator(sink);
