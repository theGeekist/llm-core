import { describe, expect, it } from "bun:test";
import type { Model, ModelCall } from "../../../src/adapters/types";
import { Recipe } from "../../../src/recipes/flow";
import {
  AgentFinalizePack,
  createAgentFinalizeRecipe,
} from "../../../src/recipes/agentic/finalize";
import { AgentStateHelpers } from "../../../src/recipes/agentic/shared";
import { assertSyncOutcome } from "../../workflow/helpers";

const createPlanningPack = (input: string) =>
  Recipe.pack("agent-planning", ({ step }) => ({
    plan: step("plan", ({ state }) => {
      const agent = AgentStateHelpers.readAgentState(state);
      AgentStateHelpers.setAgentInput(agent, { input, context: "system" });
      return null;
    }),
  }));

const createToolsPack = (withResults: boolean) =>
  Recipe.pack("agent-tools", ({ step }) => ({
    "tool-exec": step("tool-exec", ({ state }) => {
      const agent = AgentStateHelpers.readAgentState(state);
      agent.toolResults = withResults
        ? [{ name: "echo", result: { ok: true }, toolCallId: "tool-1" }]
        : [];
      return null;
    }),
  }));

const createCapturingModel = () => {
  const calls: ModelCall[] = [];
  const model: Model = {
    generate: (call) => {
      calls.push(call);
      return { text: "final" };
    },
  };
  return { model, calls };
};

const createMessageModel = () => {
  const model: Model = {
    generate: () => ({ messages: [{ role: "assistant", content: "ok" }] }),
  };
  return model;
};

describe("Agent finalize pack", () => {
  it("uses tool results when building the response prompt", () => {
    const { model, calls } = createCapturingModel();
    const runtime = Recipe.flow("agent")
      .use(createPlanningPack("hello"))
      .use(createToolsPack(true))
      .use(AgentFinalizePack)
      .defaults({ adapters: { model } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));

    expect(outcome.status).toBe("ok");
    expect(calls[0]?.prompt).toContain("Tool results:");
  });

  it("omits tool results when none are available", () => {
    const { model, calls } = createCapturingModel();
    const runtime = Recipe.flow("agent")
      .use(createPlanningPack("hello"))
      .use(createToolsPack(false))
      .use(AgentFinalizePack)
      .defaults({ adapters: { model } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));

    expect(outcome.status).toBe("ok");
    expect(calls[0]?.prompt).toBe("hello");
  });

  it("captures model messages on response", () => {
    const model = createMessageModel();
    const runtime = Recipe.flow("agent")
      .use(createPlanningPack("hello"))
      .use(createToolsPack(false))
      .use(AgentFinalizePack)
      .defaults({ adapters: { model } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const agent = (outcome.artefact as { agent?: { messages?: unknown[] } }).agent;
    expect(agent?.messages?.length).toBe(1);
  });

  it("plans finalize recipes with config defaults", () => {
    const recipe = createAgentFinalizeRecipe({ defaults: { adapters: {} } });
    const plan = recipe.plan();

    expect(plan.steps.length).toBe(1);
  });
});
