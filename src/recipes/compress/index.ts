import { bindFirst, maybeMap } from "../../maybe";
import { Recipe } from "../flow";
import { createRecipeFactory, createRecipeHandle } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { Model, ModelResult } from "../../adapters/types";
import { isRecord, readString } from "../../adapters/utils";

export type CompressConfig = {
  defaults?: RecipeDefaults;
};

type CompressState = {
  input?: string;
  summary?: string;
};

const COMPRESS_STATE_KEY = "compress";

const readInputRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const readCompressState = (state: Record<string, unknown>): CompressState => {
  const raw = state[COMPRESS_STATE_KEY];
  if (raw && typeof raw === "object") {
    return raw as CompressState;
  }
  const fresh: CompressState = {};
  state[COMPRESS_STATE_KEY] = fresh;
  return fresh;
};

const seedInput = (compress: CompressState, input: unknown) => {
  const record = readInputRecord(input);
  if (record?.input) {
    compress.input = readString(record.input) ?? undefined;
  }
};

const buildPrompt = (text: string) => `Summarize:\n${text}`;

const applySummary = (compress: CompressState, result: ModelResult | undefined) => {
  if (result?.text !== undefined) {
    compress.summary = result.text ?? undefined;
  }
  return null;
};

const runModel = (model: Model | null | undefined, prompt: string) => {
  if (!model) {
    return null;
  }
  return model.generate({ prompt });
};

// Seeds compression state from input text.
const applySeed: StepApply = ({ input, state }) => {
  seedInput(readCompressState(state), input);
  return null;
};

// Summarizes input using the model adapter.
const applyCompress: StepApply = ({ context, state }) => {
  const compress = readCompressState(state);
  const model = context.adapters?.model;
  const text = compress.input ?? "";
  const result = runModel(model, buildPrompt(text));
  if (result === null) {
    return null;
  }
  return maybeMap(bindFirst(applySummary, compress), result);
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineCompressSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeed),
  compress: step("compress", applyCompress).dependsOn("seed"),
});

export const createCompressPack = (config?: CompressConfig) =>
  Recipe.pack("compress", defineCompressSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model"],
  });

const resolveCompressPack = (config?: CompressConfig) =>
  config ? createCompressPack(config) : CompressPack;

const resolveCompressRecipeDefinition = (config?: CompressConfig) => ({
  packs: [resolveCompressPack(config)],
});

const compressRecipeFactory = createRecipeFactory("agent", resolveCompressRecipeDefinition);

export const createCompressRecipe = (config?: CompressConfig) =>
  createRecipeHandle(compressRecipeFactory, config);

export const compressRecipe = (config?: CompressConfig) => createCompressRecipe(config);
export const CompressPack = createCompressPack();
