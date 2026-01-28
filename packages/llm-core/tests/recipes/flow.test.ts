import { describe, expect, it } from "bun:test";
import type { Outcome } from "#workflow/types";
import { createMemoryCache } from "../../src/adapters";
import type { AdapterTraceEvent } from "../../src/adapters/types";
import { emitRecipeEvent, readRecipeEvents } from "../../src/recipes/events";
import { type StepApply, Recipe } from "../../src/recipes/flow";
import { toNull } from "../../src/shared/fp";
import { maybeMap } from "../../src/shared/maybe";
import { assertSyncOutcome, diagnosticMessages } from "../workflow/helpers";

const appendOrder = (state: Record<string, unknown>, label: string) => {
  const order = Array.isArray(state.order) ? [...state.order] : [];
  order.push(label);
  state.order = order;
};

const expectOk = (outcome: Outcome) => {
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") {
    throw new Error("Expected ok outcome.");
  }
  return outcome;
};

const stepFirst: StepApply = ({ state }) => {
  appendOrder(state, "first");
  return null;
};

const stepSecond: StepApply = ({ state }) => {
  appendOrder(state, "second");
  return null;
};

const stepThird: StepApply = ({ state }) => {
  appendOrder(state, "third");
  return null;
};

const stepExplicit: StepApply = ({ state }) => {
  appendOrder(state, "explicit");
  return { output: { order: ["ignored"] } };
};

const stepRollback: StepApply = ({ state }) => {
  appendOrder(state, "rolled");
  return { rollback: Recipe.rollback(rollbackNoop) };
};

const stepEmitEvent: StepApply = ({ context, state }) =>
  maybeMap(toNull, emitRecipeEvent(context, state, recipeEvent));

const stepRetryEmbedder: StepApply = ({ context }) => {
  const retryEmbedder = context.adapters?.embedder;
  if (!retryEmbedder) {
    return null;
  }
  return maybeMap(toNull, retryEmbedder.embed("hi"));
};

const stepRollbackBuilder: StepApply = ({ state }) => {
  appendOrder(state, "builder");
  return null;
};

const rollbackNoop = () => true;

const recipeEvent: AdapterTraceEvent = {
  name: "recipe.event",
  data: { ok: true },
};

describe("Recipe flow packs", () => {
  it("runs pack steps in dependency order", () => {
    const pack = Recipe.pack("order", ({ step }) => ({
      first: step("first", stepFirst),
      second: step("second", stepSecond).dependsOn("first"),
    }));

    const workflow = Recipe.flow("rag").use(pack).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "hello", query: "hello" }));
    const ok = expectOk(outcome);

    const order = (ok.artefact as { order?: unknown }).order;
    expect(order).toEqual(["first", "second"]);
  });

  it("honors cross-pack dependencies", () => {
    const packA = Recipe.pack("packA", ({ step }) => ({
      first: step("first", stepFirst),
    }));

    const packB = Recipe.pack("packB", ({ step }) => ({
      third: step("third", stepThird).dependsOn("packA.first"),
    }));

    const workflow = Recipe.flow("rag").use(packA).use(packB).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "world", query: "world" }));
    const ok = expectOk(outcome);

    const order = (ok.artefact as { order?: unknown }).order;
    expect(order).toEqual(["first", "third"]);
  });

  it("applies pack defaults for adapters", () => {
    const cache = createMemoryCache();
    const pack = Recipe.pack(
      "defaults",
      ({ step }) => ({
        first: step("first", stepFirst),
      }),
      { defaults: { adapters: { cache } } },
    );

    const runtime = Recipe.flow("agent").use(pack).build();

    expect(runtime.declaredAdapters().cache).toBe(cache);
  });

  it("keeps explicit helper output when provided", () => {
    const pack = Recipe.pack("explicit", ({ step }) => ({
      only: step("only", stepExplicit),
    }));

    const workflow = Recipe.flow("rag").use(pack).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);
    const order = (ok.artefact as { order?: unknown }).order;

    expect(order).toEqual(["explicit"]);
  });

  it("fills output when a step only returns rollback", () => {
    const pack = Recipe.pack("rollback", ({ step }) => ({
      only: step("only", stepRollback),
    }));

    const workflow = Recipe.flow("rag").use(pack).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);
    const order = (ok.artefact as { order?: unknown }).order;

    expect(order).toEqual(["rolled"]);
  });

  it("applies step builder rollbacks without touching pipeline helpers", () => {
    const pack = Recipe.pack("rollback-builder", ({ step }) => ({
      only: step("only", stepRollbackBuilder).rollback(rollbackNoop),
    }));

    const workflow = Recipe.flow("rag").use(pack).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);
    const order = (ok.artefact as { order?: unknown }).order;

    expect(order).toEqual(["builder"]);
  });

  it("emits recipe events into state and event streams", () => {
    const emitted: AdapterTraceEvent[] = [];
    const eventStream = {
      emit: (event: AdapterTraceEvent) => {
        emitted.push(event);
        return true;
      },
    };
    const pack = Recipe.pack("events", ({ step }) => ({
      only: step("only", stepEmitEvent),
    }));

    const workflow = Recipe.flow("rag").use(pack).defaults({ adapters: { eventStream } }).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    expect(emitted).toEqual([recipeEvent]);
    expect(readRecipeEvents(ok.artefact as Record<string, unknown>)).toEqual([recipeEvent]);
  });

  it("adds diagnostics when state validation fails", () => {
    const validateState = () => false;
    const pack = Recipe.pack("state", ({ step }) => ({
      only: step("only", stepFirst),
    }));

    const workflow = Recipe.flow("rag").use(pack).state(validateState).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    const messages = diagnosticMessages(ok.diagnostics);
    expect(messages).toContain("Recipe state validation failed.");
  });

  it("applies flow defaults and pack default plugins", () => {
    const pluginA = { key: "defaults.flow.plugin" };
    const pluginB = { key: "defaults.pack.plugin" };
    const pack = Recipe.pack(
      "defaults",
      ({ step }) => ({
        only: step("only", stepFirst),
      }),
      { defaults: { plugins: [pluginB] } },
    );

    const runtime = Recipe.flow("rag")
      .use(pack)
      .defaults({ plugins: [pluginA] })
      .build();
    const explanation = runtime.explain();

    expect(explanation.plugins).toContain("defaults.flow.plugin");
    expect(explanation.plugins).toContain("defaults.pack.plugin");
    expect(explanation.plugins).not.toContain("recipe.defaults.flow");
  });

  it("diagnoses duplicate pack names", () => {
    const packA = Recipe.pack("dup", ({ step }) => ({
      first: step("first", stepFirst),
    }));
    const packB = Recipe.pack("dup", ({ step }) => ({
      second: step("second", stepSecond),
    }));
    const runtime = Recipe.flow("rag").use(packA).use(packB).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", query: "x" }));

    expect(outcome.status).toBe("ok");
    const messages = diagnosticMessages(outcome.diagnostics);
    expect(messages).toContain('Duplicate recipe pack name "dup" overridden');
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const order = (outcome.artefact as { order?: unknown }).order;
    expect(order).toEqual(["second"]);
  });

  it("escalates duplicate pack names in strict mode", () => {
    const packA = Recipe.pack("dup", ({ step }) => ({
      first: step("first", stepFirst),
    }));
    const packB = Recipe.pack("dup", ({ step }) => ({
      second: step("second", stepSecond),
    }));
    const runtime = Recipe.flow("rag").use(packA).use(packB).build();
    const outcome = assertSyncOutcome(
      runtime.run({ input: "x", query: "x" }, { diagnostics: "strict" }),
    );

    if (outcome.status !== "error") {
      throw new Error("Expected error outcome.");
    }
    const messages = diagnosticMessages(outcome.diagnostics);
    expect(messages).toContain('Duplicate recipe pack name "dup" overridden');
  });

  it("pauses when retry policy requests a pause", () => {
    let attempts = 0;
    const embedder = {
      embed: () => {
        attempts += 1;
        throw new Error("flaky");
      },
    };
    const pack = Recipe.pack("retry", ({ step }) => ({
      only: step("only", stepRetryEmbedder),
    }));

    const runtime = Recipe.flow("rag").use(pack).defaults({ adapters: { embedder } }).build();
    const outcome = assertSyncOutcome(
      runtime.run(
        { input: "x", query: "x" },
        { retry: { embedder: { maxAttempts: 3, backoffMs: 100, mode: "pause" } } },
      ),
    );

    expect(outcome.status).toBe("paused");
    if (outcome.status !== "paused") {
      throw new Error("Expected paused outcome.");
    }
    expect(outcome.token).toBeDefined();
    expect(attempts).toBe(1);
  });

  it("applies retry defaults from recipe defaults", () => {
    let attempts = 0;
    const embedder = {
      embed: () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("flaky");
        }
        return [0.1];
      },
    };
    const pack = Recipe.pack("retry-defaults", ({ step }) => ({
      only: step("only", stepRetryEmbedder),
    }));
    const runtime = Recipe.flow("rag")
      .use(pack)
      .defaults({
        adapters: { embedder },
        retryDefaults: { embedder: { maxAttempts: 2, backoffMs: 0 } },
      })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", query: "x" }));

    expect(outcome.status).toBe("ok");
    expect(attempts).toBe(2);
  });
});
