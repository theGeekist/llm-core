import { bindFirst, maybeMap } from "../../shared/maybe";
import { Recipe } from "../flow";
import { createRecipeFactory, createRecipeHandle } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { Model, ModelResult } from "../../adapters/types";
import { readNumber, readString } from "../../adapters/utils";
import { isRecord } from "../../shared/guards";

export type LoopConfig = {
  defaults?: RecipeDefaults;
};

type LoopState = Record<string, unknown>;

const LOOP_STATE_PREFIX = "loop.";

const readInputRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const readLoopState = (state: Record<string, unknown>): LoopState => state;

const toLoopKey = (key: string) => `${LOOP_STATE_PREFIX}${key}`;

const setLoopValue = (state: LoopState, key: string, value: unknown) => {
  state[toLoopKey(key)] = value;
};

const readLoopValue = <T>(state: LoopState, key: string) => state[toLoopKey(key)] as T | undefined;

const readLoopInput = (input: unknown) => {
  const record = readInputRecord(input);
  return {
    input: readString(record?.input) ?? "",
    maxIterations: readNumber(record?.maxIterations),
  };
};

const normalizeIterations = (value: number | undefined) => {
  if (value === undefined) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
};

const buildIterationEntry = (seed: string, index: number) => `${seed}#${index + 1}`;

const buildIterations = (seed: string, total: number) =>
  Array.from({ length: total }, (_, index) => buildIterationEntry(seed, index));

const applySeedStep = (options: Parameters<StepApply>[0]) => {
  const loop = readLoopState(options.state);
  const parsed = readLoopInput(options.input);
  setLoopValue(loop, "input", parsed.input);
  setLoopValue(loop, "maxIterations", normalizeIterations(parsed.maxIterations ?? undefined));
  return null;
};

const applyModelResult = (loop: LoopState, result: ModelResult | null) => {
  if (result?.text !== undefined) {
    setLoopValue(loop, "result", result.text);
  }
  return null;
};

const runModel = (model: Model | null | undefined, prompt: string) =>
  model ? model.generate({ prompt }) : null;

const applyIterate: StepApply = ({ context, state }) => {
  const loop = readLoopState(state);
  const seed = readLoopValue<string>(loop, "input") ?? "";
  const maxIterations = normalizeIterations(readLoopValue<number>(loop, "maxIterations"));
  setLoopValue(loop, "iterations", buildIterations(seed, maxIterations));
  const result = runModel(context.adapters?.model, seed);
  if (!result) {
    setLoopValue(loop, "result", seed);
    return null;
  }
  return maybeMap(bindFirst(applyModelResult, loop), result);
};

const applyFinalize: StepApply = ({ state }) => {
  const loop = readLoopState(state);
  if (!readLoopValue(loop, "result")) {
    setLoopValue(loop, "result", readLoopValue(loop, "input") ?? "");
  }
  setLoopValue(loop, "terminationReason", "completed");
  return null;
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineLoopSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeedStep),
  iterate: step("iterate", applyIterate).dependsOn("seed"),
  finalize: step("finalize", applyFinalize).dependsOn("iterate"),
});

export const createLoopPack = (config?: LoopConfig) =>
  Recipe.pack("loop", defineLoopSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model", "recipe"],
  });

const resolveLoopPack = (config?: LoopConfig) => (config ? createLoopPack(config) : LoopPack);

const resolveLoopRecipeDefinition = (config?: LoopConfig) => ({
  packs: [resolveLoopPack(config)],
});

const loopRecipeFactory = createRecipeFactory("loop", resolveLoopRecipeDefinition);

// Loop recipe: seed -> iterate -> finalize.
export const createLoopRecipe = (config?: LoopConfig) =>
  createRecipeHandle(loopRecipeFactory, config);

export const LoopPack = createLoopPack();
export const loopRecipe = (config?: LoopConfig) => createLoopRecipe(config);
