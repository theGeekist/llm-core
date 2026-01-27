import { describe, expect, it } from "bun:test";
import type { Outcome } from "#workflow/types";
import { createMemoryCache } from "../../src/adapters";
import { Recipe } from "../../src/recipes/flow";
import {
  createRecipeFactory,
  createRecipeHandle,
  createConfiguredRecipeHandle,
  type RecipeRunOverrides,
  configureRecipeHandle,
  defaultsRecipeHandle,
  useRecipeHandle,
} from "../../src/recipes/handle";
import { assertSyncOutcome } from "../workflow/helpers";

type HandleConfig = { label?: string };

const appendOrder = (state: Record<string, unknown>, label: string) => {
  const order = Array.isArray(state.order) ? [...state.order] : [];
  order.push(label);
  state.order = order;
};

const buildPack = (name: string, label: string): ReturnType<typeof Recipe.pack> =>
  Recipe.pack(name, ({ step }) => ({
    only: step("only", ({ state }) => {
      appendOrder(state, label);
      state.label = label;
      return null;
    }),
  }));

const buildProviderPack = (name: string): ReturnType<typeof Recipe.pack> =>
  Recipe.pack(name, ({ step }) => ({
    only: step("only", ({ state, context }) => {
      state.providers = context.runtime?.providers;
      return null;
    }),
  }));

const createFactory = () =>
  createRecipeFactory("rag", (config?: HandleConfig) => ({
    packs: [buildPack("base", config?.label ?? "base")],
  }));

const expectOk = (outcome: Outcome) => {
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") {
    throw new Error("Expected ok outcome.");
  }
  return outcome;
};

describe("Recipe handle", () => {
  it("configures packs via the recipe factory", () => {
    const handle = createRecipeHandle(createFactory(), { label: "base" }).configure({
      label: "configured",
    });
    const runtime = handle.build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    expect((ok.artefact as { label?: string }).label).toBe("configured");
  });

  it("merges defaults and adapter overrides", () => {
    const cache = createMemoryCache();
    const handle = createRecipeHandle(createFactory()).defaults({ adapters: { cache } });
    const runtime = handle.build();

    expect(runtime.declaredAdapters().cache).toBe(cache);
  });

  it("composes with other recipe handles and packs", () => {
    const primary = createRecipeHandle(createFactory());
    const secondary = createRecipeHandle(
      createRecipeFactory("rag", () => ({ packs: [buildPack("extra", "extra")] })),
    );
    const combined = primary.use(secondary).use(buildPack("tail", "tail"));
    const outcome = assertSyncOutcome(combined.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);
    const order = (ok.artefact as { order?: unknown }).order;

    expect(order).toEqual(["base", "extra", "tail"]);
  });

  it("includes packs in the plan output", () => {
    const handle = createRecipeHandle(createFactory()).use(buildPack("plan", "plan"));
    const plan = handle.explain();
    const stepIds = plan.steps.map((step) => step.id);

    expect(stepIds).toEqual(expect.arrayContaining(["base.only", "plan.only"]));
  });

  it("merges providers into runtime overrides", () => {
    const factory = createRecipeFactory("rag", () => ({ packs: [buildProviderPack("providers")] }));
    const handle = createRecipeHandle(factory);
    const overrides: RecipeRunOverrides = {
      runtime: { diagnostics: "default" },
      providers: { model: "test-model" },
    };
    const outcome = assertSyncOutcome(handle.run({ input: "x", query: "x" }, overrides));
    const ok = expectOk(outcome);

    expect((ok.artefact as { providers?: unknown }).providers).toEqual({ model: "test-model" });
  });

  it("exposes helper factories for composing handles", () => {
    const factory = createFactory();
    const base = createConfiguredRecipeHandle(factory, { label: "configured" });
    const withDefaults = defaultsRecipeHandle(base, { adapters: { cache: createMemoryCache() } });
    const withPack = useRecipeHandle(withDefaults, buildPack("addon", "addon"));
    const configured = configureRecipeHandle(withPack, { label: "updated" });
    const outcome = assertSyncOutcome(configured.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    expect((ok.artefact as { label?: string }).label).toBe("updated");
  });
});
