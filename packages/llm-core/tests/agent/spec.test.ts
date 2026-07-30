import { describe, expect, test } from "bun:test";
import { contractVersion } from "#contracts";
import { prepareWithLocalRunner } from "./helpers";

describe("AgentSpec", () => {
  test("defensively clones and freezes portable specifications", () => {
    const source = {
      agentId: "researcher",
      version: contractVersion("2.0.0"),
      instructions: "Research the supplied subject.",
      effectRequirement: "read-only" as const,
      metadata: { nested: { value: "original" } },
    };
    const prepared = prepareWithLocalRunner(source);

    source.metadata.nested.value = "mutated";

    expect(prepared.metadata).toEqual({ nested: { value: "original" } });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.metadata?.nested)).toBe(true);
  });

  test("rejects non-portable metadata", () => {
    expect(() =>
      prepareWithLocalRunner({
        agentId: "researcher",
        version: contractVersion("2.0.0"),
        instructions: "Research.",
        effectRequirement: "read-only",
        metadata: { credential: undefined } as never,
      }),
    ).toThrow("portable");
  });
});
