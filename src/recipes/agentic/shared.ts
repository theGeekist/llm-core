import type {
  AdapterBundle,
  Message,
  Model,
  ModelCall,
  ModelResult,
  Tool,
  ToolCall,
  ToolResult,
} from "../../adapters/types";
import { isRecord, readString } from "../../adapters/utils";
import { bindFirst, maybeAll, maybeMap, type MaybePromise } from "../../maybe";
import type { PipelineContext, PipelineState } from "../../workflow/types";

const AGENT_STATE_KEY = "agent";
const DEFAULT_THREAD_ID = "default";

export type AgentState = {
  input?: string;
  context?: string;
  plan?: string;
  memory?: Record<string, unknown>;
  messages?: Message[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  response?: string;
  threadId?: string;
};

type AgentInput = { input?: string; context?: string; threadId?: string };

const readInputRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const readAgentInput = (value: unknown): AgentInput => {
  const record = readInputRecord(value);
  return {
    input: readString(record?.input),
    context: readString(record?.context),
    threadId: readString(record?.threadId),
  };
};

const readAgentState = (state: PipelineState): AgentState => {
  const raw = state[AGENT_STATE_KEY];
  if (isRecord(raw)) {
    return raw as AgentState;
  }
  const fresh: AgentState = {};
  state[AGENT_STATE_KEY] = fresh;
  return fresh;
};

const setAgentInput = (agent: AgentState, input: AgentInput) => {
  if (input.input !== undefined) {
    agent.input = input.input;
  }
  if (input.context !== undefined) {
    agent.context = input.context;
  }
  if (input.threadId !== undefined) {
    agent.threadId = input.threadId;
  }
  if (!agent.threadId) {
    agent.threadId = DEFAULT_THREAD_ID;
  }
};

const readAdapters = (context: PipelineContext): AdapterBundle => context.adapters ?? {};

const readModel = (context: PipelineContext): Model | undefined => readAdapters(context).model;

const readTools = (context: PipelineContext): Tool[] => readAdapters(context).tools ?? [];

const createCall = (agent: AgentState, call: Partial<ModelCall>): ModelCall => ({
  prompt: agent.input,
  system: agent.context,
  ...call,
});

const runModel = (model: Model | undefined, call: ModelCall) =>
  model ? model.generate(call) : null;

const applyModelResult = (agent: AgentState, result: ModelResult) => {
  if (result.text !== undefined) {
    agent.plan = result.text;
  }
  if (result.messages) {
    agent.messages = result.messages;
  }
  if (result.toolCalls) {
    agent.toolCalls = result.toolCalls;
  }
};

const findTool = (tools: Tool[], call: ToolCall) => tools.find((tool) => tool.name === call.name);

const createMissingToolResult = (call: ToolCall): ToolResult => ({
  name: call.name,
  toolCallId: call.id,
  isError: true,
  result: { error: "tool_not_found" },
});

const executeToolCall = (tool: Tool | undefined, call: ToolCall): MaybePromise<ToolResult> => {
  if (!tool?.execute) {
    return createMissingToolResult(call);
  }
  return maybeMap(
    (result) => ({
      name: call.name,
      toolCallId: call.id,
      result,
    }),
    tool.execute(call.arguments),
  );
};

const executeToolCallWithTools = (tools: Tool[], call: ToolCall) =>
  executeToolCall(findTool(tools, call), call);

const executeToolCalls = (tools: Tool[], calls: ToolCall[]) =>
  maybeAll(calls.map(bindFirst(executeToolCallWithTools, tools)));

const applyToolResults = (agent: AgentState, results: ToolResult[]) => {
  agent.toolResults = results;
};

export const AgentStateHelpers = {
  readAgentInput,
  readAgentState,
  setAgentInput,
  readModel,
  readTools,
  createCall,
  runModel,
  applyModelResult,
  executeToolCalls,
  applyToolResults,
};
