import { afterEach, describe, expect, test } from "bun:test";
import { newCoreId } from "#contracts";
import type { InvocationContext, InvocationId } from "#contracts";
import { BUILTIN_PROVIDER } from "../../src/features/model/builtin";
import { createBuiltinModel, type ModelRequest } from "../../src/features/model/public";

const CONTEXT: InvocationContext = {
  invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-0000000000c1"),
};

const ask = (text: string): ModelRequest => ({
  messages: [{ role: "user", content: [{ kind: "text", text }] }],
});

describe("builtin model", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  test("echoes the last user text with usage and a stop finish", async () => {
    const model = createBuiltinModel();
    const response = await model.generate({ request: ask("ping"), context: CONTEXT });
    expect(response.kind).toBe("completion");
    if (response.kind !== "completion") return;
    expect(response.content).toEqual([{ kind: "text", text: "ping" }]);
    expect(response.finishReason).toBe("stop");
    expect(response.usage?.totalTokens).toBeGreaterThan(0);
    expect(response.metadata?.provider).toBe(BUILTIN_PROVIDER);
  });

  test("produces structured JSON output when a json response format is requested", async () => {
    const model = createBuiltinModel();
    const response = await model.generate({
      request: { ...ask("payload"), responseFormat: { kind: "json" } },
      context: CONTEXT,
    });
    if (response.kind !== "completion") throw new Error("expected completion");
    const [part] = response.content;
    expect(part?.kind).toBe("json");
    if (part?.kind === "json") {
      expect(part.value).toEqual({ echo: "payload" });
    }
  });

  test("is deterministic for identical input", async () => {
    const model = createBuiltinModel();
    const a = await model.generate({ request: ask("same"), context: CONTEXT });
    const b = await model.generate({ request: ask("same"), context: CONTEXT });
    expect(a).toEqual(b);
  });

  test("ignores ambient provider credentials", async () => {
    const model = createBuiltinModel();
    const baseline = await model.generate({ request: ask("secretless"), context: CONTEXT });
    process.env.OPENAI_API_KEY = "sk-should-be-ignored";
    const withEnv = await model.generate({ request: ask("secretless"), context: CONTEXT });
    expect(withEnv).toEqual(baseline);
    expect(JSON.stringify(withEnv)).not.toContain("sk-should-be-ignored");
  });
});
