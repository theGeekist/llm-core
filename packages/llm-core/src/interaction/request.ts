import type { AdapterBundle, EventStream, Message, Model } from "#adapters/types";
import type { DiagnosticEntry } from "#shared/reporting";
import type { MaybePromise } from "#shared/maybe";
import type { Outcome } from "#workflow/types";
import { createStreamingModelForInteraction } from "#workflow/stream";
import { createRecipeRunner } from "#recipes/runner";
import { inputs } from "#recipes/inputs";
import { emitInteractionEvent } from "./transport";
import type { InteractionEvent, InteractionEventMeta } from "./types";
import { bindFirst } from "#shared/fp";
import { maybeAll, maybeMap, maybeTap } from "#shared/maybe";

const INTERACTION_RECIPE_IDS = ["agent", "rag", "hitl", "chat.simple", "chat.rag"] as const;

export type InteractionRecipeId = (typeof INTERACTION_RECIPE_IDS)[number];

export type InteractionRunRequest = {
  recipeId?: InteractionRecipeId;
  model: Model;
  adapters?: AdapterBundle;
  messages: Message[];
  eventStream: EventStream;
  interactionId: string;
  correlationId?: string;
  threadId?: string;
};

const DEFAULT_RECIPE_ID: InteractionRecipeId = "chat.simple";

const resolveRecipeId = (value?: InteractionRecipeId) => value ?? DEFAULT_RECIPE_ID;

type SequenceState = {
  current: number;
};

const incrementSequence = (state: SequenceState) => {
  state.current += 1;
  return state.current;
};

const createSequence = () => bindFirst(incrementSequence, { current: 0 });

const readCorrelationId = (input: { correlationId?: string; interactionId: string }) =>
  input.correlationId ?? input.interactionId;

const readLastUserMessage = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      return message;
    }
  }
  return null;
};

const readMessagePartText = (part: unknown) => {
  if (typeof part === "string") {
    return part;
  }
  if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return null;
};

const readMessageArrayText = (parts: unknown[]) => {
  for (const part of parts) {
    const text = readMessagePartText(part);
    if (text) {
      return text;
    }
  }
  return null;
};

const readMessageText = (message: Message | null) => {
  if (!message) {
    return null;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return readMessageArrayText(message.content);
  }
  if (
    message.content &&
    typeof message.content === "object" &&
    "text" in message.content &&
    typeof message.content.text === "string"
  ) {
    return message.content.text;
  }
  return null;
};

const normalizeText = (text: string | null) => {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readUserInputText = (messages: Message[]) =>
  normalizeText(readMessageText(readLastUserMessage(messages)));

const buildRecipeInput = (input: {
  recipeId: InteractionRecipeId;
  text: string;
  interactionId: string;
  threadId?: string;
}) => {
  if (input.recipeId === "rag" || input.recipeId === "chat.rag") {
    return inputs.rag({ text: input.text, query: input.text });
  }
  if (input.recipeId === "hitl") {
    return inputs.hitl({ text: input.text });
  }
  return inputs.agent({
    text: input.text,
    threadId: input.threadId ?? input.interactionId,
  });
};

const buildStreamingModel = (input: {
  model: Model;
  eventStream: EventStream;
  interactionId: string;
  correlationId: string;
  sourceIdPrefix: string;
  nextSequence: () => number;
}) =>
  createStreamingModelForInteraction({
    model: input.model,
    eventStream: input.eventStream,
    interactionId: input.interactionId,
    correlationId: input.correlationId,
    sourceIdPrefix: input.sourceIdPrefix,
    nextSequence: input.nextSequence,
  });

const buildRunner = (input: { recipeId: InteractionRecipeId; model: Model }) =>
  createRecipeRunner({ recipeId: input.recipeId, model: input.model });

const isKnownRecipeId = (value: string): value is InteractionRecipeId =>
  (INTERACTION_RECIPE_IDS as readonly string[]).includes(value);

const toRecipeId = (value?: string | null): InteractionRecipeId => {
  if (value && isKnownRecipeId(value)) {
    return value;
  }
  return DEFAULT_RECIPE_ID;
};

type DiagnosticEmitInput = {
  eventStream: EventStream;
  interactionId: string;
  correlationId: string;
  nextSequence: () => number;
  diagnostics: DiagnosticEntry[];
};

const DIAGNOSTIC_SOURCE_ID = "workflow.diagnostics";

const isFailure = (value: boolean | null) => value === false;
const isNullResult = (value: boolean | null) => value === null;

const combineEmitResults = (values: Array<boolean | null>) => {
  if (values.some(isFailure)) {
    return false;
  }
  if (values.some(isNullResult)) {
    return null;
  }
  return true;
};

const createDiagnosticMeta = (input: {
  nextSequence: () => number;
  interactionId: string;
  correlationId: string;
  sourceId: string;
}): InteractionEventMeta => ({
  sequence: input.nextSequence(),
  timestamp: Date.now(),
  sourceId: input.sourceId,
  interactionId: input.interactionId,
  correlationId: input.correlationId,
});

const toDiagnosticEvent = (input: {
  entry: DiagnosticEntry;
  meta: InteractionEventMeta;
}): InteractionEvent => ({
  kind: "diagnostic",
  entry: input.entry,
  meta: input.meta,
});

const emitDiagnosticEvents = (input: DiagnosticEmitInput) => {
  const results: Array<ReturnType<EventStream["emit"]>> = [];
  for (const entry of input.diagnostics) {
    const meta = createDiagnosticMeta({
      nextSequence: input.nextSequence,
      interactionId: input.interactionId,
      correlationId: input.correlationId,
      sourceId: DIAGNOSTIC_SOURCE_ID,
    });
    const event = toDiagnosticEvent({ entry, meta });
    results.push(emitInteractionEvent(input.eventStream, event));
  }
  return maybeMap(combineEmitResults, maybeAll(results));
};

const emitDiagnosticsFromOutcome = (
  input: Omit<DiagnosticEmitInput, "diagnostics">,
  outcome: Outcome<unknown>,
) => {
  const diagnostics = outcome.diagnostics ?? [];
  if (diagnostics.length === 0) {
    return outcome;
  }
  return maybeTap(
    bindFirst(emitDiagnosticEvents, {
      ...input,
      diagnostics,
    }),
    outcome,
  );
};

const buildAdapterOverrides = (input: {
  request: InteractionRunRequest;
  streamingModel: Model;
}): AdapterBundle => ({
  ...(input.request.adapters ?? {}),
  model: input.streamingModel,
  eventStream: input.request.eventStream,
});

export const runInteractionRequest = (
  request: InteractionRunRequest,
): MaybePromise<Outcome<unknown>> | null => {
  const recipeId = resolveRecipeId(request.recipeId);
  const text = readUserInputText(request.messages);
  if (!text) {
    return null;
  }
  const correlationId = readCorrelationId(request);
  const nextSequence = createSequence();
  const runner = buildRunner({ recipeId, model: request.model });
  const streamingModel = buildStreamingModel({
    model: request.model,
    eventStream: request.eventStream,
    interactionId: request.interactionId,
    correlationId,
    sourceIdPrefix: recipeId,
    nextSequence,
  });
  const input = buildRecipeInput({
    recipeId,
    text,
    interactionId: request.interactionId,
    threadId: request.threadId,
  });
  const overrides = {
    adapters: buildAdapterOverrides({ request, streamingModel }),
  };
  return maybeMap(
    bindFirst(emitDiagnosticsFromOutcome, {
      eventStream: request.eventStream,
      interactionId: request.interactionId,
      correlationId,
      nextSequence,
    }),
    runner.run(input, overrides),
  );
};

export const resolveInteractionRecipeId = (value?: string | null) => toRecipeId(value);

export const hasRecipeId = (value: string): value is InteractionRecipeId => isKnownRecipeId(value);
