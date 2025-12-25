import type {
  ConversationMessage,
  MemoryProvider,
  MemoryScope,
  WorkingMemory,
} from "@ai-sdk-tools/memory";
import type { AdapterCallContext, Memory, Turn, Thread } from "../types";
import { fromPromiseLike, mapMaybe } from "../../maybe";
import {
  reportDiagnostics,
  validateMemoryLoadInput,
  validateMemorySaveInput,
  validateMemoryTurn,
  validateMemoryProvider,
  validateThreadId,
} from "../input-validation";

type AiSdkMemoryOptions = {
  scope?: MemoryScope;
  userId?: string;
};

type MemoryIdentifiers = {
  chatId?: string;
  userId?: string;
  scope: MemoryScope;
};

const readString = (value: unknown) => (typeof value === "string" ? value : undefined);

const readChatId = (input: Record<string, unknown>) =>
  readString(input.chatId) ?? readString(input.threadId);

const readUserId = (input: Record<string, unknown>, options?: AiSdkMemoryOptions) =>
  readString(input.userId) ?? options?.userId;

const toScope = (options?: AiSdkMemoryOptions): MemoryScope => options?.scope ?? "chat";

const toIdentifiers = (
  input: Record<string, unknown>,
  options?: AiSdkMemoryOptions,
): MemoryIdentifiers => ({
  chatId: readChatId(input),
  userId: readUserId(input, options),
  scope: toScope(options),
});

const toTurnContent = (content: ConversationMessage["content"]) =>
  typeof content === "string" ? content : "";

const toTurn = (message: ConversationMessage): Turn => ({
  role: message.role,
  content: toTurnContent(message.content),
  timestamp: message.timestamp?.getTime(),
});

const toProviderRole = (role: Turn["role"]): ConversationMessage["role"] =>
  role === "tool" ? "assistant" : role;

const toThread = (threadId: string, messages: ConversationMessage[]): Thread => ({
  id: threadId,
  turns: messages.map(toTurn),
});

const toWorkingMemoryRecord = (memory: WorkingMemory | null) =>
  memory
    ? {
        workingMemory: memory.content,
        workingMemoryUpdatedAt: memory.updatedAt,
      }
    : {};

const readWorkingMemoryContent = (output: Record<string, unknown>) =>
  readString(output.workingMemory);

const reportThreadMissing = (context: AdapterCallContext | undefined, action: string) => {
  reportDiagnostics(context, validateThreadId(undefined, action));
};

const reportProviderMissing = (
  context: AdapterCallContext | undefined,
  method: string,
  action: string,
) => {
  reportDiagnostics(context, validateMemoryProvider(method, action));
};

const toUndefined = () => undefined;

export function fromAiSdkMemory(provider: MemoryProvider, options?: AiSdkMemoryOptions): Memory {
  function read(threadId: string, context?: AdapterCallContext) {
    const diagnostics = validateThreadId(threadId, "read");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return undefined;
    }
    if (!provider.getMessages) {
      reportProviderMissing(context, "getMessages", "read");
      return undefined;
    }
    return mapMaybe(
      fromPromiseLike(provider.getMessages({ chatId: threadId, userId: options?.userId })),
      (messages) => toThread(threadId, messages),
    );
  }

  function append(threadId: string, turn: Turn, context?: AdapterCallContext) {
    const diagnostics = validateThreadId(threadId, "append").concat(validateMemoryTurn(turn));
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }
    if (!provider.saveMessage) {
      reportProviderMissing(context, "saveMessage", "append");
      return;
    }
    const timestamp = new Date(turn.timestamp ?? Date.now());
    const message: ConversationMessage = {
      chatId: threadId,
      userId: options?.userId,
      role: toProviderRole(turn.role),
      content: turn.content,
      timestamp,
    };
    return mapMaybe(fromPromiseLike(provider.saveMessage(message)), toUndefined);
  }

  function load(input: Record<string, unknown>, context?: AdapterCallContext) {
    const diagnostics = validateMemoryLoadInput(input);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return {};
    }
    if (!provider.getWorkingMemory) {
      reportProviderMissing(context, "getWorkingMemory", "load");
      return {};
    }
    const ids = toIdentifiers(input, options);
    if (ids.scope === "chat" && !ids.chatId) {
      reportThreadMissing(context, "load");
      return {};
    }
    return mapMaybe(
      fromPromiseLike(
        provider.getWorkingMemory({
          chatId: ids.chatId,
          userId: ids.userId,
          scope: ids.scope,
        }),
      ),
      toWorkingMemoryRecord,
    );
  }

  function save(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ) {
    const diagnostics = validateMemorySaveInput(input, output);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }
    if (!provider.updateWorkingMemory) {
      reportProviderMissing(context, "updateWorkingMemory", "save");
      return;
    }
    const ids = toIdentifiers(input, options);
    if (ids.scope === "chat" && !ids.chatId) {
      reportThreadMissing(context, "save");
      return;
    }
    const content = readWorkingMemoryContent(output);
    if (content === undefined) {
      return;
    }
    return mapMaybe(
      fromPromiseLike(
        provider.updateWorkingMemory({
          chatId: ids.chatId,
          userId: ids.userId,
          scope: ids.scope,
          content,
        }),
      ),
      toUndefined,
    );
  }

  return { read, append, load, save };
}
