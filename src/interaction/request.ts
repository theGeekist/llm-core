import type { EventStream, Message, Model } from "#adapters/types";
import type { Outcome } from "#workflow/types";
import type { MaybePromise } from "#shared/maybe";
import { createStreamingModelForInteraction } from "#workflow/stream";
import { createRecipeRunner } from "#recipes/runner";
import { inputs } from "#recipes/inputs";

export type InteractionRecipeId = "agent" | "rag" | "hitl" | "chat.simple" | "chat.rag";

export type InteractionRunRequest = {
  recipeId?: InteractionRecipeId;
  model: Model;
  messages: Message[];
  eventStream: EventStream;
  interactionId: string;
  correlationId?: string;
  threadId?: string;
};

const DEFAULT_RECIPE_ID: InteractionRecipeId = "chat.simple";

const resolveRecipeId = (value?: InteractionRecipeId) => value ?? DEFAULT_RECIPE_ID;

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

const readMessageText = (message: Message | null) => {
  if (!message) {
    return null;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if ("text" in message.content && typeof message.content.text === "string") {
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
  correlationId?: string;
  sourceIdPrefix: string;
}) =>
  createStreamingModelForInteraction({
    model: input.model,
    eventStream: input.eventStream,
    interactionId: input.interactionId,
    correlationId: input.correlationId ?? input.interactionId,
    sourceIdPrefix: input.sourceIdPrefix,
  });

const buildRunner = (input: { recipeId: InteractionRecipeId; model: Model }) =>
  createRecipeRunner({ recipeId: input.recipeId, model: input.model });

const isKnownRecipeId = (value: string): value is InteractionRecipeId =>
  value === "agent" ||
  value === "rag" ||
  value === "hitl" ||
  value === "chat.simple" ||
  value === "chat.rag";

const toRecipeId = (value?: string | null): InteractionRecipeId => {
  if (value && isKnownRecipeId(value)) {
    return value;
  }
  return DEFAULT_RECIPE_ID;
};

export const runInteractionRequest = (
  request: InteractionRunRequest,
): MaybePromise<Outcome<unknown> | null> => {
  const recipeId = resolveRecipeId(request.recipeId);
  const text = readUserInputText(request.messages);
  if (!text) {
    return null;
  }
  const runner = buildRunner({ recipeId, model: request.model });
  const streamingModel = buildStreamingModel({
    model: request.model,
    eventStream: request.eventStream,
    interactionId: request.interactionId,
    correlationId: request.correlationId,
    sourceIdPrefix: recipeId,
  });
  const input = buildRecipeInput({
    recipeId,
    text,
    interactionId: request.interactionId,
    threadId: request.threadId,
  });
  return runner.run(input, { adapters: { model: streamingModel } });
};

export const resolveInteractionRecipeId = (value?: string | null) => toRecipeId(value);

export const hasRecipeId = (value: string): value is InteractionRecipeId => isKnownRecipeId(value);
