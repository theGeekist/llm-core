import {
  isContractVersion,
  isExternalId,
  isJsonValue,
  type JsonValue,
  type ToolCallId,
} from "#contracts";
import { isPromiseLike, maybeChain, maybeReduce, type MaybePromise } from "#shared/maybe";
import {
  registerConversationRecord,
  createConversationMessage,
  type ConversationStore,
  type ConversationMessage,
} from "../../features/memory/public";
import type {
  Model,
  ModelContentPart,
  ModelMessage,
  ModelResponse,
  ToolCallPart,
  ToolDeclaration,
} from "../../features/model/public";
import {
  isRegisteredExecutableTool,
  type ExecutableTool,
  type ToolCall,
  type ToolExecutionResult,
} from "../../features/tooling/runtime";
import {
  isPreparedAgentDefinition,
  type PreparedAgentDefinition,
  type AgentResult,
} from "../../features/agent/public";
import type {
  DeclaredSubagentBinding,
  LocalAgentExecutionContext,
  LocalAgentExecutionResult,
  LocalAgentProgramPort,
} from "./types";

export interface ModelToolAgentProgramOptions {
  readonly model: Model;
  readonly tools?: readonly ExecutableTool[];
  readonly conversation?: ConversationStore;
  readonly subagents?: readonly DeclaredSubagentBinding[];
  readonly maxModelCalls?: number;
  readonly projectOutput?: (content: readonly ModelContentPart[]) => JsonValue;
  readonly controlledToolInput?: (
    input: ControlledToolInputFactoryInput,
  ) => Parameters<NonNullable<LocalAgentExecutionContext["controlledToolExecution"]>["execute"]>[0];
}

export interface ControlledToolInputFactoryInput {
  readonly tool: ExecutableTool;
  readonly call: ToolCall;
  readonly context: LocalAgentExecutionContext;
}

interface LoopState {
  readonly context: LocalAgentExecutionContext;
  readonly messages: ModelMessage[];
  modelCalls: number;
  toolCalls: number;
}

interface ComposedSubagentBinding {
  readonly declaration: Readonly<ToolDeclaration>;
  readonly agentId: string;
  readonly agentVersion: DeclaredSubagentBinding["agentVersion"];
  readonly resolve: DeclaredSubagentBinding["resolve"];
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

const toolDeclarations = (tools: readonly ExecutableTool[]): ToolDeclaration[] =>
  tools.map(({ definition }) => ({
    name: definition.id,
    description: definition.description,
    parameters: definition.inputSchema.document,
  }));

const freezeJson = <T extends JsonValue>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => freezeJson(child));
  }
  return value;
};

const snapshotDeclaration = (declaration: Readonly<ToolDeclaration>): Readonly<ToolDeclaration> => {
  if (
    !isJsonValue(declaration) ||
    !isExternalId(declaration.name) ||
    (declaration.description !== undefined && typeof declaration.description !== "string")
  ) {
    throw new TypeError("Subagent declarations must be portable model tool declarations.");
  }
  const keys = Object.keys(declaration);
  if (keys.some((key) => !["name", "description", "parameters"].includes(key))) {
    throw new TypeError("Subagent declarations cannot contain undeclared fields.");
  }
  return freezeJson(structuredClone(declaration));
};

const composeSubagents = (
  bindings: readonly DeclaredSubagentBinding[],
): readonly ComposedSubagentBinding[] => {
  const composed = bindings.map((binding): ComposedSubagentBinding => {
    if (
      !isExternalId(binding.agentId) ||
      !isContractVersion(binding.agentVersion) ||
      typeof binding.resolve !== "function"
    ) {
      throw new TypeError("Subagent bindings require a stable expected agent identity.");
    }
    return Object.freeze({
      declaration: snapshotDeclaration(binding.declaration),
      agentId: binding.agentId,
      agentVersion: binding.agentVersion,
      resolve: binding.resolve,
    });
  });
  return Object.freeze(composed);
};

const initialMessages = (
  context: LocalAgentExecutionContext,
  history: readonly ConversationMessage[],
): ModelMessage[] => [
  { role: "system", content: [{ kind: "text", text: context.request.agent.instructions }] },
  ...history.map((turn) => ({ role: turn.role, content: [...turn.content] })),
  { role: "user", content: [{ kind: "json", value: context.request.input }] },
];

const asToolExecutionResultPart = (
  call: ToolCallPart,
  result: ToolExecutionResult,
): ModelContentPart => ({
  kind: "tool-result",
  toolCallId: call.toolCallId,
  result:
    result.status === "succeeded"
      ? result.content
      : [{ kind: "text", text: result.error.safeMessage ?? result.error.code }],
  ...(result.status === "failed" ? { isError: true } : {}),
});

const childToolExecutionResult = (call: ToolCallPart, result: AgentResult): ModelContentPart => ({
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

const unavailableChildResult = (call: ToolCallPart): ModelContentPart =>
  asToolExecutionResultPart(call, {
    toolCallId: call.toolCallId,
    status: "failed",
    error: { code: "subagent-unavailable", retryable: false },
  });

const runDeclaredSubagent = (
  state: LoopState,
  call: ToolCallPart,
  child: PreparedAgentDefinition,
): MaybePromise<ModelContentPart> =>
  maybeChain(
    (run) => maybeChain((result) => childToolExecutionResult(call, result), run.result()),
    state.context.startChild({
      agent: child,
      invocationContext: state.context.request.invocationContext,
      input: call.arguments,
    }),
  );

const appendConversation = (
  store: ConversationStore | undefined,
  state: LoopState,
  message: ModelMessage,
): MaybePromise<void> => {
  if (message.content.some((part) => part.kind === "binary")) {
    throw new TypeError("Conversation persistence cannot silently discard inline binary content.");
  }
  const turn = createConversationMessage({
    role: message.role,
    content: message.content as ConversationMessage["content"],
  });
  const conversationId = state.context.request.invocationContext.conversationId;
  if (!store || !conversationId) return undefined;
  // `undefined` is the intentional synchronous MaybePromise branch.
  // eslint-disable-next-line consistent-return
  return maybeChain(
    (): void => {},
    store.append({
      context: state.context.request.invocationContext,
      conversationId,
      turn,
    }),
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
  const tools = [...(options.tools ?? [])];
  if (tools.some((tool) => !isRegisteredExecutableTool(tool))) {
    throw new TypeError("Model tool programs require registered ExecutableTool values.");
  }
  const byName = new Map(tools.map((tool) => [tool.definition.id as string, tool]));
  if (byName.size !== tools.length) {
    throw new TypeError("Agent tools must use unique identities.");
  }
  const subagents = composeSubagents(options.subagents ?? []);
  const subagentsByName = new Map(subagents.map((binding) => [binding.declaration.name, binding]));
  if (subagentsByName.size !== subagents.length) {
    throw new TypeError("Agent subagent bindings must use unique tool declaration names.");
  }
  if ([...subagentsByName.keys()].some((name) => byName.has(name))) {
    throw new TypeError("Agent tool and subagent declarations cannot use the same name.");
  }
  const declarations = Object.freeze([
    ...toolDeclarations(tools),
    ...subagents.map((binding) => binding.declaration),
  ]);
  const maxModelCalls = validateLimit(options.maxModelCalls);
  const projectOutput = options.projectOutput ?? textOutput;

  const runTool = (state: LoopState, callPart: ToolCallPart): MaybePromise<ModelContentPart> => {
    const subagent = subagentsByName.get(callPart.name);
    if (subagent) {
      return maybeChain((child) => {
        if (
          !isPreparedAgentDefinition(child) ||
          child.agentId !== subagent.agentId ||
          child.version !== subagent.agentVersion
        ) {
          return unavailableChildResult(callPart);
        }
        return runDeclaredSubagent(state, callPart, child);
      }, subagent.resolve());
    }
    const tool = byName.get(callPart.name);
    if (!tool) {
      return asToolExecutionResultPart(callPart, {
        toolCallId: callPart.toolCallId,
        status: "failed",
        error: { code: "unknown-tool", retryable: false },
      });
    }
    if (!isRegisteredExecutableTool(tool)) {
      throw new TypeError("Model tool execution requires a registered ExecutableTool.");
    }
    const call: ToolCall = {
      toolCallId: callPart.toolCallId as ToolCallId,
      toolId: tool.definition.id,
      toolVersion: tool.definition.version,
      arguments: callPart.arguments,
      invocation: {
        ...state.context.request.invocationContext,
        runId: state.context.identity.runId,
        toolCallId: callPart.toolCallId,
      },
    };
    if (tool.definition.effect.class !== "read-only") {
      if (!state.context.controlledToolExecution || !options.controlledToolInput) {
        return asToolExecutionResultPart(callPart, {
          toolCallId: callPart.toolCallId,
          status: "failed",
          error: { code: "controlled-execution-unavailable", retryable: false },
        });
      }
      return maybeChain(
        (outcome) => {
          if (outcome.status === "succeeded" || outcome.status === "failed") {
            return asToolExecutionResultPart(callPart, outcome.result);
          }
          return asToolExecutionResultPart(callPart, {
            toolCallId: callPart.toolCallId,
            status: "failed",
            error: { code: `controlled-${outcome.status}`, retryable: false },
          });
        },
        state.context.controlledToolExecution.execute(
          options.controlledToolInput({ tool, call, context: state.context }),
        ),
      );
    }
    return maybeChain(
      (result) => asToolExecutionResultPart(callPart, result),
      tool.execute({ call }),
    );
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
      options.model.generate({
        request: {
          messages: structuredClone(state.messages),
          ...(declarations.length > 0 ? { tools: [...declarations] } : {}),
        },
        context: state.context.request.invocationContext,
      }),
    );
  };
  /* eslint-enable sonarjs/no-nested-functions */

  const execute = (
    context: LocalAgentExecutionContext,
  ): MaybePromise<LocalAgentExecutionResult> => {
    const conversationId = context.request.invocationContext.conversationId;
    const loaded =
      options.conversation && conversationId
        ? options.conversation.read({
            context: context.request.invocationContext,
            conversationId,
          })
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
