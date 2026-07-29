import type { Tool, ToolCall, ToolResult } from "#adapters/types";
import { bindFirst } from "./fp";
import { maybeAll, maybeMap, maybeTry, type MaybePromise } from "./maybe";

type ToolExecutionErrorHandler = (call: ToolCall, error: unknown) => MaybePromise<ToolResult>;

type ExecuteToolCallsInput = {
  tools: Tool[];
  calls: ToolCall[];
  onError?: ToolExecutionErrorHandler;
};

type ExecuteToolCallInput = Pick<ExecuteToolCallsInput, "tools" | "onError">;

const findTool = (tools: Tool[], call: ToolCall) => tools.find((tool) => tool.name === call.name);

const createMissingToolResult = (call: ToolCall): ToolResult => ({
  name: call.name,
  toolCallId: call.id,
  isError: true,
  result: { error: "tool_not_found" },
});

const createToolResult = (call: ToolCall, result: unknown): ToolResult => ({
  name: call.name,
  toolCallId: call.id,
  result,
});

const runTool = (input: { tool?: Tool; call: ToolCall }): MaybePromise<ToolResult> => {
  if (!input.tool?.execute) {
    return createMissingToolResult(input.call);
  }
  return maybeMap(
    bindFirst(createToolResult, input.call),
    input.tool.execute({ input: input.call.arguments }),
  );
};

const executeToolCall = (input: ExecuteToolCallInput, call: ToolCall) => {
  const run = bindFirst(runTool, { tool: findTool(input.tools, call), call });
  return input.onError ? maybeTry(bindFirst(input.onError, call), run) : run();
};

export const executeToolCalls = (input: ExecuteToolCallsInput) =>
  maybeAll(input.calls.map(bindFirst(executeToolCall, input)));
