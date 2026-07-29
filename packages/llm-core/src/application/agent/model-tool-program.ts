import type { JsonValue, ToolCallId } from "#contracts";
import { isPromiseLike, maybeChain, maybeReduce, type MaybePromise } from "#shared/maybe";
import {
  registerConversationRecord,
  registerConversationTurn,
  type ConversationStore,
  type ConversationTurn,
} from "../../features/memory/public";
import type {
  Model,
  ModelContentPart,
  ModelMessage,
  ModelResponse,
  ToolCallPart,
  ToolDeclaration,
} from "../../features/model/public";
import type { ToolBinding, ToolCall, ToolResult } from "../../features/tooling/public";
import type { PreparedAgentSpec, RunResult } from "../../features/agent/public";
import type {
  LocalAgentExecutionContext,
  LocalAgentExecutionResult,
  LocalAgentProgramPort,
} from "./types";

export interface ModelToolAgentProgramOptions {
  readonly model: Model;
  readonly tools?: readonly ToolBinding[];
  readonly conversation?: ConversationStore;
  readonly subagents?: Readonly<Record<string, PreparedAgentSpec>>;
  readonly maxModelCalls?: number;
  readonly projectOutput?: (content: readonly ModelContentPart[]) => JsonValue;
  readonly controlledToolInput?: (
    binding: ToolBinding,
    call: ToolCall,
    context: LocalAgentExecutionContext,
  ) => Parameters<NonNullable<LocalAgentExecutionContext["controlledToolExecution"]>["execute"]>[0];
}

interface LoopState {
  readonly context: LocalAgentExecutionContext;
  readonly messages: ModelMessage[];
  modelCalls: number;
  toolCalls: number;
}

const textOutput = (content: readonly ModelContentPart[]): JsonValue => {
  const portable = content.flatMap((part): JsonValue[] => {
    if (part.kind === "text") return [part.text];
    if (part.kind === "json") return [part.value];
    return [];
  });
  if (portable.length === 0) {
    throw new TypeError("Agent model completions require portable text or JSON output.");
  }
  return portable.length === 1 ? portable[0]! : portable;
};

const toolDeclarations = (bindings: readonly ToolBinding[]): ToolDeclaration[] =>
  bindings.map(({ spec }) => ({
    name: spec.id,
    description: spec.description,
    parameters: spec.inputSchema.document,
  }));

const initialMessages = (
  context: LocalAgentExecutionContext,
  history: readonly ConversationTurn[],
): ModelMessage[] => [
  { role: "system", content: [{ kind: "text", text: context.request.agent.instructions }] },
  ...history.map((turn) => ({ role: turn.role, content: [...turn.content] })),
  { role: "user", content: [{ kind: "json", value: context.request.input }] },
];

const asToolResultPart = (call: ToolCallPart, result: ToolResult): ModelContentPart => ({
  kind: "tool-result",
  toolCallId: call.toolCallId,
  result:
    result.status === "succeeded"
      ? result.content
      : [{ kind: "text", text: result.error.safeMessage ?? result.error.code }],
  ...(result.status === "failed" ? { isError: true } : {}),
});

const childToolResult = (call: ToolCallPart, result: RunResult): ModelContentPart => ({
  kind: "tool-result",
  toolCallId: call.toolCallId,
  result: [
    {
      kind: "json",
      value: {
        status: result.status,
        ...(result.output === undefined ? {} : { output: result.output }),
        ...(result.reasonCode === undefined ? {} : { reasonCode: result.reasonCode }),
        runId: result.identity.runId,
      },
    },
  ],
  ...(result.status !== "completed" ? { isError: true } : {}),
});

const appendConversation = (
  store: ConversationStore | undefined,
  state: LoopState,
  message: ModelMessage,
): MaybePromise<void> => {
  if (message.content.some((part) => part.kind === "binary")) {
    throw new TypeError("Conversation persistence cannot silently discard inline binary content.");
  }
  const turn = registerConversationTurn({
    role: message.role,
    content: message.content as ConversationTurn["content"],
  });
  const conversationId = state.context.request.invocationContext.conversationId;
  if (!store || !conversationId) return undefined;
  // `undefined` is the intentional synchronous MaybePromise branch.
  // eslint-disable-next-line consistent-return
  return maybeChain(
    (): void => {},
    store.append(state.context.request.invocationContext, conversationId, turn),
  );
};

const executionResult = (
  response: Extract<ModelResponse, { kind: "completion" }>,
  projectOutput: (content: readonly ModelContentPart[]) => JsonValue,
): LocalAgentExecutionResult => ({
  status: "completed",
  output: projectOutput(response.content),
});

const validateLimit = (value: number | undefined): number => {
  const limit = value ?? 32;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("Agent program maxModelCalls must be a positive safe integer.");
  }
  return limit;
};

export const createModelToolAgentProgram = (
  options: ModelToolAgentProgramOptions,
): LocalAgentProgramPort => {
  const bindings = [...(options.tools ?? [])];
  const byName = new Map(bindings.map((binding) => [binding.spec.id as string, binding]));
  if (byName.size !== bindings.length) {
    throw new TypeError("Agent tool bindings must use unique tool identities.");
  }
  const maxModelCalls = validateLimit(options.maxModelCalls);
  const projectOutput = options.projectOutput ?? textOutput;

  const runTool = (state: LoopState, callPart: ToolCallPart): MaybePromise<ModelContentPart> => {
    const child = options.subagents?.[callPart.name];
    if (child) {
      return maybeChain(
        (run) => maybeChain((result) => childToolResult(callPart, result), run.result()),
        state.context.startChild({
          agent: child,
          invocationContext: state.context.request.invocationContext,
          input: callPart.arguments,
        }),
      );
    }
    const binding = byName.get(callPart.name);
    if (!binding) {
      return asToolResultPart(callPart, {
        toolCallId: callPart.toolCallId,
        status: "failed",
        error: { code: "unknown-tool", retryable: false },
      });
    }
    const call: ToolCall = {
      toolCallId: callPart.toolCallId as ToolCallId,
      toolId: binding.spec.id,
      toolVersion: binding.spec.version,
      arguments: callPart.arguments,
      invocation: {
        ...state.context.request.invocationContext,
        runId: state.context.identity.runId,
        toolCallId: callPart.toolCallId,
      },
    };
    if (binding.spec.effect.class !== "read-only") {
      if (!state.context.controlledToolExecution || !options.controlledToolInput) {
        return asToolResultPart(callPart, {
          toolCallId: callPart.toolCallId,
          status: "failed",
          error: { code: "controlled-execution-unavailable", retryable: false },
        });
      }
      return maybeChain(
        (outcome) => {
          if (outcome.status === "succeeded" || outcome.status === "failed") {
            return asToolResultPart(callPart, outcome.result);
          }
          return asToolResultPart(callPart, {
            toolCallId: callPart.toolCallId,
            status: "failed",
            error: { code: `controlled-${outcome.status}`, retryable: false },
          });
        },
        state.context.controlledToolExecution.execute(
          options.controlledToolInput(binding, call, state.context),
        ),
      );
    }
    return maybeChain((result) => asToolResultPart(callPart, result), binding.execute(call));
  };

  // The loop deliberately keeps the model response, tool fan-out and portable
  // persistence transition together so each iteration has one state boundary.
  /* eslint-disable sonarjs/no-nested-functions -- MaybePromise composition preserves synchronous execution */
  // eslint-disable-next-line sonarjs/no-nested-functions
  const loop = (state: LoopState): MaybePromise<LocalAgentExecutionResult> => {
    if (state.context.cancellation.isCancellationRequested()) {
      return { status: "cancelled", reasonCode: "cancellation-requested" };
    }
    const budgetLimit = state.context.request.invocationContext.budget?.maxModelCalls;
    const effectiveLimit = Math.min(maxModelCalls, budgetLimit ?? maxModelCalls);
    if (state.modelCalls >= effectiveLimit) {
      return { status: "failed", reasonCode: "model-call-limit-exceeded" };
    }
    state.modelCalls += 1;
    return maybeChain(
      (response): MaybePromise<LocalAgentExecutionResult> => {
        if (response.kind === "error") {
          return { status: "failed", reasonCode: response.error.code };
        }
        const assistant: ModelMessage = { role: "assistant", content: response.content };
        state.messages.push(assistant);
        const calls = response.content.filter(
          (part): part is ToolCallPart => part.kind === "tool-call",
        );
        if (calls.length === 0) {
          return maybeChain(
            () => ({
              ...executionResult(response, projectOutput),
              ...(state.context.request.providerSession
                ? { providerSession: state.context.request.providerSession }
                : {}),
            }),
            appendConversation(options.conversation, state, assistant),
          );
        }
        const toolBudget = state.context.request.invocationContext.budget?.maxToolCalls;
        if (toolBudget !== undefined && state.toolCalls + calls.length > toolBudget) {
          return { status: "failed", reasonCode: "tool-call-limit-exceeded" };
        }
        state.toolCalls += calls.length;
        return maybeChain(
          () =>
            maybeChain(
              (parts) => {
                const toolMessage: ModelMessage = { role: "tool", content: parts };
                state.messages.push(toolMessage);
                return maybeChain(
                  // eslint-disable-next-line sonarjs/no-nested-functions
                  () => loop(state),
                  appendConversation(options.conversation, state, toolMessage),
                );
              },
              maybeReduce(
                (parts, call) =>
                  maybeChain(
                    // eslint-disable-next-line sonarjs/no-nested-functions
                    (part) => [...parts, part],
                    runTool(state, call),
                  ),
                [] as ModelContentPart[],
                calls,
              ),
            ),
          appendConversation(options.conversation, state, assistant),
        );
      },
      options.model.generate(
        {
          messages: structuredClone(state.messages),
          ...(bindings.length > 0 ? { tools: toolDeclarations(bindings) } : {}),
        },
        state.context.request.invocationContext,
      ),
    );
  };
  /* eslint-enable sonarjs/no-nested-functions */

  const execute = (
    context: LocalAgentExecutionContext,
  ): MaybePromise<LocalAgentExecutionResult> => {
    const conversationId = context.request.invocationContext.conversationId;
    const loaded =
      options.conversation && conversationId
        ? options.conversation.read(context.request.invocationContext, conversationId)
        : null;
    const start = (record: Awaited<typeof loaded>) => {
      const registered = record === null ? null : registerConversationRecord(record);
      if (registered && registered.conversationId !== conversationId) {
        throw new TypeError("Conversation stores cannot substitute conversation identity.");
      }
      const messages = initialMessages(context, registered?.turns ?? []);
      const state: LoopState = { context, messages, modelCalls: 0, toolCalls: 0 };
      const user = messages[messages.length - 1]!;
      return maybeChain(() => loop(state), appendConversation(options.conversation, state, user));
    };
    return isPromiseLike(loaded) ? Promise.resolve(loaded).then(start) : start(loaded);
  };

  return Object.freeze({ execute });
};
