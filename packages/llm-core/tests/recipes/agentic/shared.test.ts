import { describe, expect, it } from "bun:test";
import type { Tool } from "../../../src/adapters/types";
import { AgentStateHelpers } from "../../../src/recipes/agentic/shared";

describe("Agent state helpers", () => {
  it("reads agent input and assigns a default thread id", () => {
    const input = { input: "hello", context: "system" };
    const agent = AgentStateHelpers.readAgentState({});
    const parsed = AgentStateHelpers.readAgentInput(input);

    AgentStateHelpers.setAgentInput(agent, parsed);
    expect(agent.input).toBe("hello");
    expect(agent.context).toBe("system");
    expect(agent.threadId).toBe("default");
  });

  it("captures model results into agent state", () => {
    const agent = AgentStateHelpers.readAgentState({});
    AgentStateHelpers.applyModelResult(agent, {
      text: "plan",
      messages: [{ role: "assistant", content: "ok" }],
      toolCalls: [{ name: "tool", arguments: {}, id: "tool-1" }],
    });

    expect(agent.plan).toBe("plan");
    expect(agent.messages?.length).toBe(1);
    expect(agent.toolCalls?.length).toBe(1);
  });

  it("executes tool calls and reports missing tools", () => {
    const tools: Tool[] = [
      {
        name: "echo",
        execute: (input) => input,
      },
    ];
    const calls = [
      { name: "echo", arguments: { value: "ok" }, id: "tool-1" },
      { name: "missing", arguments: { value: "nope" }, id: "tool-2" },
    ];
    const results = AgentStateHelpers.executeToolCalls(tools, calls);

    if (!Array.isArray(results)) {
      throw new Error("Expected sync tool results.");
    }
    expect(results[0]?.name).toBe("echo");
    expect(results[1]?.isError).toBe(true);
  });
});
