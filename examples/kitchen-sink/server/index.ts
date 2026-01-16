/// <reference types="bun-types" />
import { serve } from "bun";
import type { Server, ServerWebSocket } from "bun";
import {
  createAssistantUiInteractionStream,
  createAiSdkInteractionEventStream,
  parseAssistantTransportRequest,
  type AdapterSource,
  type ModelSelection,
  type ProviderId,
  toCoreMessagesFromAssistantCommands,
  selectModel,
} from "@geekist/llm-core/adapters";
import { Outcome } from "@geekist/llm-core/workflow";
import type { OutcomeType } from "@geekist/llm-core/workflow";
import { toCoreMessages } from "./messages";
import type { ClientChatRequest } from "./protocol";
import { parseClientMessage } from "./protocol";
import { createWebSocketUiWriter, sendUiDone, sendUiError } from "./transport";
import { AssistantStream, DataStreamEncoder } from "assistant-stream";
import { createSocketData, setSocketToken, type SocketData } from "./socket-data";
import {
  maybeChain,
  maybeMap,
  maybeMapOr,
  maybeTap,
  maybeTry,
  bindFirst,
  toUndefined,
  type MaybePromise,
} from "@geekist/llm-core";
import { resolveInteractionRecipeId, runInteractionRequest } from "@geekist/llm-core/interaction";

const PORT = 3001;

const server = serve({
  port: PORT,
  fetch: handleFetch,
  websocket: {
    open: handleOpen,
    message: handleMessage,
    close: handleClose,
  },
});

console.log(`Kitchen sink server listening on ws://localhost:${server.port}`);

function handleFetch(req: Request, serverInstance: Server<SocketData>) {
  const url = new URL(req.url);
  if (url.pathname === "/ws") {
    const upgraded = serverInstance.upgrade(req, { data: createSocketData() });
    if (upgraded) {
      return new Response(null, { status: 101 });
    }
  }
  if (url.pathname === "/assistant") {
    return handleAssistantTransport(req);
  }
  return new Response("Not found", { status: 404 });
}

function handleOpen(socket: ServerWebSocket<SocketData>) {
  handleOpenCore(socket);
  return toUndefined();
}

function handleMessage(socket: ServerWebSocket<SocketData>, message: string | Uint8Array) {
  handleMessageCore(socket, message);
  return toUndefined();
}

function handleClose(socket: ServerWebSocket<SocketData>, _code: number, _reason: string) {
  handleCloseCore(socket);
  return toUndefined();
}

const handleOpenCore = (socket: ServerWebSocket<SocketData>) => {
  socket.data = socket.data ?? createSocketData();
  return true;
};

const handleMessageCore = (socket: ServerWebSocket<SocketData>, message: string | Uint8Array) => {
  const payload = typeof message === "string" ? message : new TextDecoder().decode(message);
  const parsed = parseClientMessage(payload);
  if (!parsed) {
    socket.send(
      JSON.stringify({ type: "ui.error", requestId: "unknown", error: "invalid_message" }),
    );
    return false;
  }
  if (parsed.type === "auth.set") {
    setSocketToken(socket.data, parsed.providerId, parsed.token);
    return true;
  }
  void runChatRequest(socket, parsed);
  return true;
};

const handleCloseCore = (_socket: ServerWebSocket<SocketData>) => null;

type RunOutcomeInput = {
  socket: ServerWebSocket<SocketData>;
  requestId: string;
};

type RunChatInput = RunOutcomeInput & { run: MaybePromise<unknown> };
type RunChatHandlerInput = {
  outcomeInput: RunOutcomeInput;
  runResult: MaybePromise<unknown> | null;
};

const applyOutcome = (input: RunOutcomeInput, outcome: unknown) => {
  const summary = Outcome.summary(outcome as OutcomeType);
  sendUiDone({
    socket: input.socket,
    requestId: input.requestId,
    status: summary.status,
    token: summary.token ?? null,
  });
  return true;
};

const applyRun = (input: RunChatInput) => maybeChain(bindFirst(applyOutcome, input), input.run);

const applyRunError = (input: RunOutcomeInput, error: unknown) => {
  sendUiError(input.socket, input.requestId, String(error));
  return false;
};

const applyNoOutcome = (input: RunOutcomeInput) => {
  sendUiDone({ socket: input.socket, requestId: input.requestId });
  return true;
};

const applyRunOutcome = (input: RunOutcomeInput, outcome: unknown) =>
  applyRun({ ...input, run: outcome });

const handleRunResult = (input: RunChatHandlerInput) =>
  maybeMapOr(
    bindFirst(applyRunOutcome, input.outcomeInput),
    bindFirst(applyNoOutcome, input.outcomeInput),
    input.runResult,
  );

const createRunChatHandlerInput = (
  outcomeInput: RunOutcomeInput,
  runResult: MaybePromise<unknown> | null,
): RunChatHandlerInput => ({
  outcomeInput,
  runResult,
});

const toModelSelection = (input: {
  data?: { adapterSource?: string; providerId?: string; modelId?: string };
  tokens?: Record<string, string>;
}): ModelSelection => ({
  source: (input.data?.adapterSource ?? null) as AdapterSource | null,
  providerId: (input.data?.providerId ?? null) as ProviderId | null,
  modelId: input.data?.modelId ?? null,
  tokens: input.tokens ?? null,
});

const runChatRequest = (socket: ServerWebSocket<SocketData>, message: ClientChatRequest) => {
  const model = selectModel(toModelSelection({ data: message.data, tokens: socket.data.tokens }));
  const coreMessages = toCoreMessages(message.messages);

  const writer = createWebSocketUiWriter(socket, message.requestId);
  const eventStream = createAiSdkInteractionEventStream({ writer });

  const recipeId = resolveInteractionRecipeId(message.data?.recipeId);
  const runResult = runInteractionRequest({
    recipeId,
    model,
    messages: coreMessages,
    eventStream,
    interactionId: message.chatId,
    correlationId: message.requestId,
  });
  const outcomeInput: RunOutcomeInput = { socket, requestId: message.requestId };
  const handlerInput = createRunChatHandlerInput(outcomeInput, runResult);

  return maybeTry(bindFirst(applyRunError, outcomeInput), bindFirst(handleRunResult, handlerInput));
};

const handleAssistantTransport = (req: Request): MaybePromise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  return maybeMap(handleAssistantBody, readRequestBody(req));
};

const handleAssistantBody = (body: unknown): Response => {
  const parsed = parseAssistantTransportRequest(body);
  if (!parsed) {
    return new Response("Invalid assistant transport payload", { status: 400 });
  }

  const model = selectModel(toModelSelection({ data: parsed.data }));
  const coreMessages = toCoreMessagesFromAssistantCommands(parsed.commands);
  const chatId = parsed.data?.chatId ?? crypto.randomUUID();

  const streamAdapter = createAssistantUiInteractionStream({ includeReasoning: true });
  const eventStream = streamAdapter.eventStream;

  const recipeId = resolveInteractionRecipeId(parsed.data?.recipeId);
  const runResult = runInteractionRequest({
    recipeId,
    model,
    messages: coreMessages,
    eventStream,
    interactionId: chatId,
    correlationId: chatId,
  });
  finalizeAssistantRun(runResult, streamAdapter.controller);
  return AssistantStream.toResponse(streamAdapter.stream, new DataStreamEncoder());
};

const readRequestBody = (req: Request): MaybePromise<unknown> =>
  maybeTry(handleReadBodyError, bindFirst(readJsonBody, req));

const readJsonBody = (req: Request) => req.json();

const handleReadBodyError = (_error: unknown) => null;

const closeAssistantController = (controller: { close: () => void }) => {
  controller.close();
  return true;
};

const ignoreAssistantRunError = (_error: unknown) => null;

const finalizeAssistantRun = (run: MaybePromise<unknown>, controller: { close: () => void }) =>
  maybeTap(
    bindFirst(closeAssistantController, controller),
    maybeTry(ignoreAssistantRunError, bindFirst(readRunValue, run)),
  );

const readRunValue = (run: MaybePromise<unknown>) => run;
