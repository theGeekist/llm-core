import { describe, expect, it } from "bun:test";
import type { Model } from "../../src/adapters/types";
import type { AnyRecipeHandle, RecipeRunOverrides } from "../../src/recipes/handle";
import { createRecipeRunner } from "../../src/recipes/runner";
import { createTraceDiagnostics } from "../../src/shared/reporting";
import type { Outcome } from "../../src/workflow/types";
import { bindFirst } from "../../src/shared/fp";

type RunRecord = {
  input?: unknown;
  overrides?: RecipeRunOverrides;
};

const createOkOutcome = (artefact: unknown): Outcome<unknown> => ({
  status: "ok",
  artefact,
  ...createTraceDiagnostics(),
});

const captureRun = (
  record: RunRecord,
  input: unknown,
  overrides?: RecipeRunOverrides,
): Outcome<unknown> => {
  record.input = input;
  record.overrides = overrides;
  return createOkOutcome("ok");
};

const createTestHandle = (record: RunRecord): AnyRecipeHandle =>
  ({
    run: bindFirst(captureRun, record),
  }) as AnyRecipeHandle;

describe("createRecipeRunner", () => {
  it("merges base overrides with run overrides", () => {
    const record: RunRecord = {};
    const model = { generate: () => ({ text: "ok" }) } as Model;
    const handle = createTestHandle(record);
    const runner = createRecipeRunner({
      handle,
      adapters: { model },
      providers: { openai: "base" },
      runtime: { diagnostics: "strict" },
    });

    runner.run({ input: "hello" }, { providers: { ollama: "extra" } });

    expect(record.input).toEqual({ input: "hello" });
    expect(record.overrides?.adapters?.model).toBe(model);
    expect(record.overrides?.providers).toEqual({ openai: "base", ollama: "extra" });
    expect(record.overrides?.runtime).toEqual({ diagnostics: "strict" });
  });

  it("runs without overrides when none are provided", () => {
    const record: RunRecord = {};
    const handle = createTestHandle(record);
    const runner = createRecipeRunner({ handle });

    runner.run({ input: "plain" });

    expect(record.overrides).toBeUndefined();
  });

  it("creates a handle from recipe id when handle is missing", async () => {
    const model = { generate: () => ({ text: "ok" }) } as Model;
    const runner = createRecipeRunner({ recipeId: "chat.simple", model });

    const result = await runner.run({ input: "hello" });

    expect(result.status).toBe("ok");
  });
});
