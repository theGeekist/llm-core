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
import type { AgentLoopConfig } from "@geekist/llm-core/interaction";
import { Outcome } from "@geekist/llm-core/workflow";
import type { OutcomeType } from "@geekist/llm-core/workflow";
import { toCoreMessages } from "./messages";
import type { ClientChatRequest, ClientChatData } from "./protocol";
import { parseClientMessage } from "./protocol";
import { createWebSocketUiWriter, sendUiDone, sendUiError } from "./transport";
import { AssistantStream, DataStreamEncoder } from "assistant-stream";
import { createSocketData, setSocketToken, type SocketData } from "./socket-data";
import { handleModelCatalogRequest } from "../../components/model-catalog";
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
import {
  createAgentRuntime,
  resolveInteractionRecipeId,
  runInteractionRequest,
} from "@geekist/llm-core/interaction";

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

console.log(`Agentic server listening on ws://localhost:${server.port}`);

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
  if (url.pathname === "/models") {
    return handleModelCatalogRequest(req);
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

type OutcomeInfo = {
  status: OutcomeType["status"];
  token: string | null;
};

const isOutcomeStatus = (value: unknown): value is OutcomeType["status"] =>
  value === "ok" || value === "paused" || value === "error";

const isOutcomeShape = (value: unknown): value is OutcomeType => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { status?: unknown };
  return isOutcomeStatus(record.status);
};

const buildOutcomeInfoOk = (_outcome: Extract<OutcomeType, { status: "ok" }>): OutcomeInfo => ({
  status: "ok",
  token: null,
});

const buildOutcomeInfoPaused = (
  outcome: Extract<OutcomeType, { status: "paused" }>,
): OutcomeInfo => ({
  status: "paused",
  token: typeof outcome.token === "string" ? outcome.token : null,
});

const buildOutcomeInfoError = (
  _outcome: Extract<OutcomeType, { status: "error" }>,
): OutcomeInfo => ({
  status: "error",
  token: null,
});

const applyOutcome = (input: RunOutcomeInput, outcome: unknown) => {
  if (!isOutcomeShape(outcome)) {
    sendUiError(input.socket, input.requestId, "invalid_outcome");
    return false;
  }
  const summary = Outcome.match(outcome, {
    ok: buildOutcomeInfoOk,
    paused: buildOutcomeInfoPaused,
    error: buildOutcomeInfoError,
  });
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
  data?: ClientChatData;
  tokens?: Record<string, string>;
}): ModelSelection => ({
  source: (input.data?.adapterSource ?? null) as AdapterSource | null,
  providerId: (input.data?.providerId ?? null) as ProviderId | null,
  modelId: input.data?.modelId ?? null,
  tokens: input.tokens ?? null,
});

const readSelectedAgentPrompt = (config?: AgentLoopConfig): string | null => {
  const selectedId = config?.agentSelection?.agentId ?? null;
  const agents = config?.agents;
  if (!agents || agents.length === 0) {
    return null;
  }
  if (selectedId) {
    for (const agent of agents) {
      if (agent.id === selectedId) {
        return agent.prompt ?? null;
      }
    }
  }
  const fallback = agents[0];
  return fallback?.prompt ?? null;
};

const normalizeContextPart = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildAgentContext = (input: { config?: AgentLoopConfig; context?: string | null }) => {
  const prompt = normalizeContextPart(readSelectedAgentPrompt(input.config));
  const context = normalizeContextPart(input.context ?? null);
  if (prompt && context) {
    return `${prompt}\n\n${context}`;
  }
  return prompt ?? context ?? null;
};

const readLastUserMessage = (messages: ReturnType<typeof toCoreMessages>) => {
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

const readMessageText = (message: ReturnType<typeof readLastUserMessage>) => {
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

const readUserInputText = (messages: ReturnType<typeof toCoreMessages>) => {
  const text = readMessageText(readLastUserMessage(messages));
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const applyMissingInputError = (input: RunOutcomeInput) => {
  sendUiError(input.socket, input.requestId, "missing_user_input");
  return false;
};

const runChatRequest = (socket: ServerWebSocket<SocketData>, message: ClientChatRequest) => {
  const outcomeInput: RunOutcomeInput = { socket, requestId: message.requestId };
  try {
    const model = selectModel(toModelSelection({ data: message.data, tokens: socket.data.tokens }));
    const coreMessages = toCoreMessages(message.messages);
    const text = readUserInputText(coreMessages);
    const config = message.data?.agentConfig;
    const context = buildAgentContext({ config, context: message.data?.context ?? null });
    const threadId = message.data?.threadId ?? message.chatId;

    const writer = createWebSocketUiWriter(socket, message.requestId);
    const eventStream = createAiSdkInteractionEventStream({ writer });

    if (!text) {
      return applyMissingInputError(outcomeInput);
    }
    const runtime = createAgentRuntime({
      model,
      config,
      subagents: message.data?.subagents,
    });
    const runResult = runtime.stream({
      text,
      context: context ?? undefined,
      threadId,
      eventStream,
      interactionId: message.chatId,
      correlationId: message.requestId,
    });
    const handlerInput = createRunChatHandlerInput(outcomeInput, runResult);

    return maybeTry(
      bindFirst(applyRunError, outcomeInput),
      bindFirst(handleRunResult, handlerInput),
    );
  } catch (error) {
    return applyRunError(outcomeInput, error);
  }
};

const handleAssistantTransport = (req: Request): MaybePromise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  return maybeMap(handleAssistantBodyOrError, readRequestBody(req));
};

const handleAssistantBodyOrError = (body: unknown) => {
  if (body === null) {
    return new Response("Invalid JSON", { status: 400 });
  }
  return handleAssistantBody(body);
};

const reportAssistantError = (error: unknown) => {
  console.error(error);
  return true;
};

const handleAssistantBody = (body: unknown): Response => {
  const parsed = parseAssistantTransportRequest(body);
  if (!parsed) {
    return new Response("Invalid assistant transport payload", { status: 400 });
  }
  let streamAdapter: ReturnType<typeof createAssistantUiInteractionStream> | null = null;

  try {
    const model = selectModel(toModelSelection({ data: parsed.data }));
    const coreMessages = toCoreMessagesFromAssistantCommands(parsed.commands);
    const chatId = parsed.data?.chatId ?? crypto.randomUUID();

    streamAdapter = createAssistantUiInteractionStream({ includeReasoning: true });
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
  } catch (error) {
    reportAssistantError(error);
    closeAssistantControllerIfPresent(streamAdapter ? streamAdapter.controller : null);
    return new Response("Internal server error", { status: 500 });
  }
};

const readRequestBody = (req: Request): MaybePromise<unknown> =>
  maybeTry(handleReadBodyError, bindFirst(readJsonBody, req));

const readJsonBody = (req: Request) => req.json();

const handleReadBodyError = (_error: unknown) => null;

const closeAssistantController = (controller: { close: () => void }) => {
  controller.close();
  return true;
};

const closeAssistantControllerIfPresent = (controller: { close: () => void } | null) => {
  if (!controller) {
    return null;
  }
  return closeAssistantController(controller);
};

const ignoreAssistantRunError = (_error: unknown) => null;

const finalizeAssistantRun = (run: MaybePromise<unknown>, controller: { close: () => void }) =>
  maybeTap(
    bindFirst(closeAssistantController, controller),
    maybeTry(ignoreAssistantRunError, bindFirst(readRunValue, run)),
  );

const readRunValue = (run: MaybePromise<unknown>) => run;
