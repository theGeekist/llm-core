import type {
  Message,
  MessageContent,
  MessagePart,
  MessageRole,
  ToolCallPart,
  ToolResultPart,
} from "../adapters/types/messages";
import type { ModelStreamEvent, QueryStreamEvent, ToolCall, ToolResult } from "../adapters/types";
import { createAdapterDiagnostic } from "../shared/diagnostics";
import type { DiagnosticEntry } from "../shared/diagnostics";
import type { TraceEvent } from "../shared/trace";
import type {
  InteractionEvent,
  InteractionEventMeta,
  InteractionReducer,
  InteractionState,
} from "./types";

type StreamAssembly = {
  role: MessageRole;
  name?: string;
  text?: string;
  reasoning?: string;
  toolCalls?: ToolCallPart[];
  toolResults?: ToolResultPart[];
  data?: unknown;
  messageId?: string;
};

const shouldSkipEvent = (state: InteractionState, meta: InteractionEventMeta) => {
  const lastSequence = state.lastSequence;
  if (lastSequence === undefined) {
    return false;
  }
  return meta.sequence <= lastSequence;
};

const updateSequence = (state: InteractionState, meta: InteractionEventMeta) => {
  if (state.lastSequence !== undefined && meta.sequence <= state.lastSequence) {
    return state;
  }
  return { ...state, lastSequence: meta.sequence };
};

const appendDiagnostic = (state: InteractionState, entry: DiagnosticEntry) => {
  const diagnostics = [...state.diagnostics, entry];
  return { ...state, diagnostics };
};

const appendDiagnostics = (state: InteractionState, entries: DiagnosticEntry[]) => {
  if (entries.length === 0) {
    return state;
  }
  const diagnostics = [...state.diagnostics, ...entries];
  return { ...state, diagnostics };
};

const appendTrace = (state: InteractionState, entry: TraceEvent) => {
  const trace = [...state.trace, entry];
  return { ...state, trace };
};

const appendEvent = (state: InteractionState, event: InteractionEvent) => {
  if (!state.events) {
    return state;
  }
  const events = [...state.events, event];
  return { ...state, events };
};

const appendMessage = (state: InteractionState, message: Message) => {
  const messages = [...state.messages, message];
  return { ...state, messages };
};

const readPrivateState = (state: InteractionState) => state.private ?? {};

const readStreams = (state: InteractionState): Record<string, StreamAssembly> => {
  const streams = readPrivateState(state).streams;
  if (!streams || typeof streams !== "object") {
    return {};
  }
  return streams as Record<string, StreamAssembly>;
};

const setStreams = (state: InteractionState, streams: Record<string, StreamAssembly>) => {
  const current = readPrivateState(state);
  const nextPrivate = { ...current, streams };
  return { ...state, private: nextPrivate };
};

const removeStream = (state: InteractionState, key: string) => {
  const streams = { ...readStreams(state) };
  if (streams[key] === undefined) {
    return state;
  }
  delete streams[key];
  return setStreams(state, streams);
};

const setStream = (state: InteractionState, key: string, assembly: StreamAssembly) => {
  const streams = { ...readStreams(state), [key]: assembly };
  return setStreams(state, streams);
};

const readStream = (state: InteractionState, key: string): StreamAssembly | undefined => {
  const streams = readStreams(state);
  return streams[key];
};

const appendRawEntry = (state: InteractionState, key: string, value: unknown): InteractionState => {
  const current = readPrivateState(state);
  const raw = current.raw ? { ...current.raw } : {};
  raw[key] = value;
  return { ...state, private: { ...current, raw } };
};

const toToolCallPart = (call: ToolCall): ToolCallPart => ({
  type: "tool-call",
  toolCallId: call.id,
  toolName: call.name,
  input: call.arguments,
});

const toToolResultPart = (result: ToolResult): ToolResultPart => ({
  type: "tool-result",
  toolCallId: result.toolCallId,
  toolName: result.name,
  output: result.result,
  isError: result.isError,
});

const appendToolCall = (assembly: StreamAssembly, call: ToolCall) => {
  const toolCalls = assembly.toolCalls ? [...assembly.toolCalls] : [];
  toolCalls.push(toToolCallPart(call));
  return { ...assembly, toolCalls };
};

const appendToolResult = (assembly: StreamAssembly, result: ToolResult) => {
  const toolResults = assembly.toolResults ? [...assembly.toolResults] : [];
  toolResults.push(toToolResultPart(result));
  return { ...assembly, toolResults };
};

const appendText = (assembly: StreamAssembly, text: string | undefined) => {
  if (!text) {
    return assembly;
  }
  return { ...assembly, text: `${assembly.text ?? ""}${text}` };
};

const appendReasoning = (assembly: StreamAssembly, reasoning: string | undefined) => {
  if (!reasoning) {
    return assembly;
  }
  return { ...assembly, reasoning: `${assembly.reasoning ?? ""}${reasoning}` };
};

const createParts = () => [] as MessagePart[];

const appendTextPart = (parts: MessagePart[], text?: string) => {
  if (!text) {
    return;
  }
  parts.push({ type: "text", text });
};

const appendReasoningPart = (parts: MessagePart[], reasoning?: string) => {
  if (!reasoning) {
    return;
  }
  parts.push({ type: "reasoning", text: reasoning });
};

const appendToolCallParts = (parts: MessagePart[], toolCalls?: ToolCallPart[]) => {
  if (!toolCalls) {
    return;
  }
  for (const call of toolCalls) {
    parts.push(call);
  }
};

const appendToolResultParts = (parts: MessagePart[], toolResults?: ToolResultPart[]) => {
  if (!toolResults) {
    return;
  }
  for (const result of toolResults) {
    parts.push(result);
  }
};

const appendDataPart = (parts: MessagePart[], data: unknown) => {
  if (data === undefined) {
    return;
  }
  parts.push({ type: "data", data });
};

const toMessageContent = (assembly: StreamAssembly): MessageContent => {
  const hasExtras = Boolean(
    assembly.reasoning || assembly.toolCalls || assembly.toolResults || assembly.data,
  );
  if (!hasExtras) {
    return assembly.text ?? "";
  }
  const parts = createParts();
  appendTextPart(parts, assembly.text);
  appendReasoningPart(parts, assembly.reasoning);
  appendToolCallParts(parts, assembly.toolCalls);
  appendToolResultParts(parts, assembly.toolResults);
  appendDataPart(parts, assembly.data);
  return {
    text: assembly.text ?? "",
    parts,
    raw: assembly.data,
  };
};

const toMessage = (assembly: StreamAssembly): Message => ({
  role: assembly.role,
  name: assembly.name,
  content: toMessageContent(assembly),
});

const streamKeyFromMeta = (meta: InteractionEventMeta) => meta.correlationId ?? meta.sourceId;

const ensureStream = (state: InteractionState, meta: InteractionEventMeta, role: MessageRole) => {
  const key = streamKeyFromMeta(meta);
  const existing = readStream(state, key);
  if (existing) {
    return { state, key, assembly: existing };
  }
  const nextAssembly: StreamAssembly = { role };
  const nextState = setStream(state, key, nextAssembly);
  return { state: nextState, key, assembly: nextAssembly };
};

const toDiagnostics = (diagnostics?: Array<import("../adapters/types").AdapterDiagnostic>) => {
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }
  const entries: DiagnosticEntry[] = [];
  for (const diagnostic of diagnostics) {
    entries.push(createAdapterDiagnostic(diagnostic));
  }
  return entries;
};

const reduceModelStart = (state: InteractionState, meta: InteractionEventMeta) =>
  ensureStream(state, meta, "assistant").state;

const reduceModelDelta = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<ModelStreamEvent, { type: "delta" }>,
) => {
  const ensured = ensureStream(state, meta, "assistant");
  let assembly = ensured.assembly;
  assembly = appendText(assembly, event.text);
  assembly = appendReasoning(assembly, event.reasoning);
  if (event.toolCall) {
    assembly = appendToolCall(assembly, event.toolCall);
  }
  if (event.toolResult) {
    assembly = appendToolResult(assembly, event.toolResult);
  }
  return setStream(ensured.state, ensured.key, assembly);
};

const reduceModelUsage = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: ModelStreamEvent,
) => appendRawEntry(state, `${meta.sourceId}:usage`, event);

const reduceModelEnd = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<ModelStreamEvent, { type: "end" }>,
) => {
  const key = streamKeyFromMeta(meta);
  const assembly = readStream(state, key);
  let nextState = state;
  if (assembly) {
    nextState = appendMessage(nextState, toMessage(assembly));
    nextState = removeStream(nextState, key);
  }
  const diagnostics = toDiagnostics(event.diagnostics);
  return appendDiagnostics(nextState, diagnostics);
};

type StreamErrorInput = {
  state: InteractionState;
  meta: InteractionEventMeta;
  error: unknown;
  diagnostics?: Array<import("../adapters/types").AdapterDiagnostic>;
};

const reduceStreamError = (input: StreamErrorInput) => {
  let nextState = appendRawEntry(input.state, `${input.meta.sourceId}:error`, input.error);
  nextState = appendDiagnostics(nextState, toDiagnostics(input.diagnostics));
  return nextState;
};

type StreamErrorEvent = {
  error: unknown;
  diagnostics?: Array<import("../adapters/types").AdapterDiagnostic>;
};

const reduceStreamErrorEvent = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: StreamErrorEvent,
) =>
  reduceStreamError({
    state,
    meta,
    error: event.error,
    diagnostics: event.diagnostics,
  });

const reduceModelError = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<ModelStreamEvent, { type: "error" }>,
) => reduceStreamErrorEvent(state, meta, event);

const reduceModelEvent = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: ModelStreamEvent,
) => {
  switch (event.type) {
    case "start":
      return reduceModelStart(state, meta);
    case "delta":
      return reduceModelDelta(state, meta, event);
    case "usage":
      return reduceModelUsage(state, meta, event);
    case "end":
      return reduceModelEnd(state, meta, event);
    case "error":
      return reduceModelError(state, meta, event);
    default:
      return state;
  }
};

const reduceQueryStart = (state: InteractionState, meta: InteractionEventMeta) => {
  const ensured = ensureStream(state, meta, "tool");
  const assembly = { ...ensured.assembly, name: meta.sourceId };
  return setStream(ensured.state, ensured.key, assembly);
};

const reduceQueryDelta = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<QueryStreamEvent, { type: "delta" }>,
) => {
  const ensured = ensureStream(state, meta, "tool");
  const assembly = appendText(ensured.assembly, event.text);
  return setStream(ensured.state, ensured.key, assembly);
};

const reduceQueryEnd = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<QueryStreamEvent, { type: "end" }>,
) => {
  const key = streamKeyFromMeta(meta);
  const assembly = readStream(state, key);
  let nextState = state;
  if (assembly) {
    const data = {
      text: event.text,
      sources: event.sources,
    };
    const nextAssembly = {
      ...assembly,
      data,
      text: event.text ?? assembly.text,
      name: assembly.name ?? meta.sourceId,
    };
    nextState = appendMessage(nextState, toMessage(nextAssembly));
    nextState = removeStream(nextState, key);
  }
  if (event.raw !== undefined) {
    nextState = appendRawEntry(nextState, `${meta.sourceId}:raw`, event.raw);
  }
  const diagnostics = toDiagnostics(event.diagnostics);
  return appendDiagnostics(nextState, diagnostics);
};

const reduceQueryError = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: Extract<QueryStreamEvent, { type: "error" }>,
) => reduceStreamErrorEvent(state, meta, event);

const reduceQueryEvent = (
  state: InteractionState,
  meta: InteractionEventMeta,
  event: QueryStreamEvent,
) => {
  switch (event.type) {
    case "start":
      return reduceQueryStart(state, meta);
    case "delta":
      return reduceQueryDelta(state, meta, event);
    case "end":
      return reduceQueryEnd(state, meta, event);
    case "error":
      return reduceQueryError(state, meta, event);
    default:
      return state;
  }
};

const reduceTraceEvent = (
  state: InteractionState,
  event: Extract<InteractionEvent, { kind: "trace" }>,
) => appendTrace(state, event.event);

const reduceDiagnosticEvent = (
  state: InteractionState,
  event: Extract<InteractionEvent, { kind: "diagnostic" }>,
) => appendDiagnostic(state, event.entry);

const reduceEventStream = (
  state: InteractionState,
  event: Extract<InteractionEvent, { kind: "event-stream" }>,
) => appendRawEntry(state, `event-stream:${event.meta.sourceId}`, event.event);

export const reduceInteractionEvent: InteractionReducer = (state, event) => {
  if (shouldSkipEvent(state, event.meta)) {
    return state;
  }
  let nextState = appendEvent(state, event);
  switch (event.kind) {
    case "trace":
      nextState = reduceTraceEvent(nextState, event);
      break;
    case "diagnostic":
      nextState = reduceDiagnosticEvent(nextState, event);
      break;
    case "model":
      nextState = reduceModelEvent(nextState, event.meta, event.event);
      break;
    case "query":
      nextState = reduceQueryEvent(nextState, event.meta, event.event);
      break;
    case "event-stream":
      nextState = reduceEventStream(nextState, event);
      break;
    default:
      break;
  }
  return updateSequence(nextState, event.meta);
};

export const reduceInteractionEvents = (state: InteractionState, events: InteractionEvent[]) => {
  let next = state;
  for (const event of events) {
    next = reduceInteractionEvent(next, event);
  }
  return next;
};
