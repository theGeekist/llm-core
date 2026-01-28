import { describe, expect, it } from "bun:test";
import { fromLangGraphInterrupt } from "#adapters";

describe("Adapter interrupt strategies", () => {
  it("maps LangGraph interrupts to restart strategies", () => {
    const strategy = fromLangGraphInterrupt();

    expect(strategy.mode).toBe("restart");
    expect(strategy.reason).toBe("langgraph.interrupt");
    expect(strategy.metadata).toEqual({ source: "langgraph" });
  });

  it("allows overriding reason and metadata", () => {
    const strategy = fromLangGraphInterrupt({
      reason: "custom",
      metadata: { workflow: "agent" },
    });

    expect(strategy.mode).toBe("restart");
    expect(strategy.reason).toBe("custom");
    expect(strategy.metadata).toEqual({ source: "langgraph", workflow: "agent" });
  });
});
