import { describe, expect, it } from "bun:test";
import type { Memory } from "../../../src/adapters/types";
import { Recipe } from "../../../src/recipes/flow";
import { AgentMemoryPack, createAgentMemoryRecipe } from "../../../src/recipes/agentic/memory";
import { AgentStateHelpers } from "../../../src/recipes/agentic/shared";
import { assertSyncOutcome } from "../../workflow/helpers";

const createPlanningPack = () =>
  Recipe.pack("agent-planning", ({ step }) => ({
    plan: step("plan", ({ state }) => {
      const agent = AgentStateHelpers.readAgentState(state);
      AgentStateHelpers.setAgentInput(agent, { input: "hello", context: "system" });
      agent.plan = "plan";
      return null;
    }),
  }));

const createFinalizePack = () =>
  Recipe.pack("agent-finalize", ({ step }) => ({
    respond: step("respond", ({ state }) => {
      const agent = AgentStateHelpers.readAgentState(state);
      agent.response = "done";
      return null;
    }),
  }));

const createMemory = () => {
  const calls: Array<{ type: "load" | "save"; payload: unknown }> = [];
  const memory: Memory = {
    load: (input) => {
      calls.push({ type: "load", payload: input });
      return { restored: true };
    },
    save: (input, output) => {
      calls.push({ type: "save", payload: { input, output } });
      return null;
    },
  };
  return { memory, calls };
};

describe("Agent memory pack", () => {
  it("loads and saves memory when adapters are available", () => {
    const { memory, calls } = createMemory();
    const runtime = Recipe.flow("agent")
      .use(createPlanningPack())
      .use(createFinalizePack())
      .use(AgentMemoryPack)
      .defaults({ adapters: { memory } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));

    expect(outcome.status).toBe("ok");
    expect(calls[0]?.type).toBe("load");
    expect(calls[1]?.type).toBe("save");
  });

  it("no-ops when memory adapters are missing", () => {
    const runtime = Recipe.flow("agent")
      .use(createPlanningPack())
      .use(createFinalizePack())
      .use(AgentMemoryPack)
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));

    expect(outcome.status).toBe("ok");
  });

  it("plans memory recipes with config defaults", () => {
    const recipe = createAgentMemoryRecipe({ defaults: { adapters: {} } });
    const plan = recipe.explain();

    expect(plan.steps.length).toBe(2);
  });
});
