import { bindFirst, maybeMap } from "../../shared/maybe";
import { Recipe } from "../flow";
import { createRecipeFactory, createRecipeHandle } from "../handle";
import type { RecipeDefaults, StepApply } from "../flow";
import type { Model, ModelResult } from "../../adapters/types";
import { readNumber, readString } from "../../adapters/utils";
import { isRecord } from "../../shared/guards";

export type EvalConfig = {
  defaults?: RecipeDefaults;
  candidateCount?: number;
};

type EvalState = Record<string, unknown>;

const EVAL_STATE_PREFIX = "eval.";
const DATASET_ROWS_KEY = "dataset.rows";

const readInputRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const readStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item) => typeof item === "string");
};

const readCandidateCount = (value: unknown): number | null => {
  const count = readNumber(value);
  if (count === undefined) {
    return null;
  }
  return Math.max(1, Math.floor(count ?? 1));
};

const readDatasetRows = (record: Record<string, unknown> | undefined) => {
  const direct = readStringArray(record?.[DATASET_ROWS_KEY]);
  if (direct) {
    return direct;
  }
  const dataset = record?.dataset;
  if (isRecord(dataset)) {
    return readStringArray(dataset.rows);
  }
  return null;
};

const readEvalState = (state: Record<string, unknown>): EvalState => state;

const toEvalKey = (key: string) => `${EVAL_STATE_PREFIX}${key}`;

const setEvalValue = (state: EvalState, key: string, value: unknown) => {
  state[toEvalKey(key)] = value;
};

const readEvalValue = <T>(state: EvalState, key: string) => state[toEvalKey(key)] as T | undefined;

const seedEvalInput = (evalState: EvalState, input: unknown, config?: EvalConfig) => {
  const record = readInputRecord(input);
  const prompt = readString(record?.prompt);
  const datasetId = readString(record?.datasetId);
  const candidatesValue = record?.candidates;
  const candidateList = readStringArray(candidatesValue);
  const candidateCount = candidateList ? candidateList.length : readCandidateCount(candidatesValue);
  const resolvedCount = candidateCount ?? config?.candidateCount ?? 1;
  if (prompt !== undefined) {
    setEvalValue(evalState, "prompt", prompt);
  }
  if (datasetId !== undefined) {
    setEvalValue(evalState, "datasetId", datasetId);
  }
  if (candidateList) {
    setEvalValue(evalState, "candidates", candidateList);
  }
  setEvalValue(evalState, "candidateCount", resolvedCount);
  const rows = readDatasetRows(record ?? undefined) ?? [];
  evalState[DATASET_ROWS_KEY] = rows;
};

const readPrompt = (evalState: EvalState) => readEvalValue<string>(evalState, "prompt") ?? "";

const readCandidateCountValue = (evalState: EvalState) =>
  readEvalValue<number>(evalState, "candidateCount") ?? 1;

const readCandidateList = (evalState: EvalState) =>
  readEvalValue<string[]>(evalState, "candidates") ?? [];

const buildCandidatePrompt = (prompt: string) => `Draft a response:\n${prompt}`;

const buildPlaceholderCandidate = (prompt: string, index: number) =>
  `Candidate ${index + 1}: ${prompt}`;

const buildCandidateList = (prompt: string, count: number, first?: string) => {
  const total = Math.max(1, count);
  const list = Array.from({ length: total }, (_, index) =>
    buildPlaceholderCandidate(prompt, index),
  );
  if (first) {
    list[0] = first;
  }
  return list;
};

type CandidateContext = {
  evalState: EvalState;
  prompt: string;
  count: number;
};

const applyCandidateResult = (context: CandidateContext, result: ModelResult | null) => {
  const generated = result?.text;
  setEvalValue(
    context.evalState,
    "candidates",
    buildCandidateList(context.prompt, context.count, generated ?? undefined),
  );
  return null;
};

const generateCandidates = (evalState: EvalState, model: Model | null | undefined) => {
  const prompt = readPrompt(evalState);
  const count = readCandidateCountValue(evalState);
  if (!model || !prompt) {
    setEvalValue(evalState, "candidates", buildCandidateList(prompt, count));
    return null;
  }
  const context: CandidateContext = { evalState, prompt, count };
  return maybeMap(
    bindFirst(applyCandidateResult, context),
    model.generate({ prompt: buildCandidatePrompt(prompt) }),
  );
};

const scoreCandidate = (candidate: string) => candidate.length;

const chooseWinnerIndex = (scores: number[]) => {
  let bestIndex = 0;
  let bestScore = scores[0] ?? 0;
  for (let index = 1; index < scores.length; index += 1) {
    const score = scores[index] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
};

const buildReport = (winner: string | undefined, winnerScore: number | undefined) => {
  if (!winner) {
    return "No winning candidate selected.";
  }
  return `Winner selected with score ${winnerScore ?? 0}: ${winner}`;
};

const applyScores = (evalState: EvalState, candidates: string[]) => {
  const scores = candidates.map(scoreCandidate);
  const winnerIndex = chooseWinnerIndex(scores);
  const winner = candidates[winnerIndex];
  const winnerScore = scores[winnerIndex];
  setEvalValue(evalState, "scores", scores);
  setEvalValue(evalState, "winner", winner);
  setEvalValue(evalState, "report", buildReport(winner, winnerScore));
  return null;
};

const applySeedStep = (config: EvalConfig | undefined, options: Parameters<StepApply>[0]) => {
  seedEvalInput(readEvalState(options.state), options.input, config);
  return null;
};

// Generates candidate answers using the model when available.
const applyGenerate: StepApply = ({ context, state }) => {
  const evalState = readEvalState(state);
  if (readCandidateList(evalState).length > 0) {
    return null;
  }
  return generateCandidates(evalState, context.adapters?.model);
};

// Scores candidates and selects a winner.
const applyScore: StepApply = ({ state }) => {
  const evalState = readEvalState(state);
  const candidates = readCandidateList(evalState);
  if (!candidates.length) {
    return null;
  }
  return applyScores(evalState, candidates);
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineEvalSteps = ({ step }: PackTools, config?: EvalConfig) => ({
  seed: step("seed", bindFirst(applySeedStep, config)),
  generate: step("generate", applyGenerate).dependsOn("seed"),
  score: step("score", applyScore).dependsOn("generate"),
});

const resolveEvalSteps = (config: EvalConfig | undefined, tools: PackTools) =>
  defineEvalSteps(tools, config);

export const createEvalPack = (config?: EvalConfig) =>
  Recipe.pack("eval", bindFirst(resolveEvalSteps, config), {
    defaults: config?.defaults,
    minimumCapabilities: ["model", "evaluator"],
  });

const resolveEvalPack = (config?: EvalConfig) => (config ? createEvalPack(config) : EvalPack);

const resolveEvalRecipeDefinition = (config?: EvalConfig) => ({
  packs: [resolveEvalPack(config)],
});

const evalRecipeFactory = createRecipeFactory("eval", resolveEvalRecipeDefinition);

// Full evaluation recipe: seed -> generate -> score.
export const createEvalRecipe = (config?: EvalConfig) =>
  createRecipeHandle(evalRecipeFactory, config);

export const EvalPack = createEvalPack();
export const evalRecipe = (config?: EvalConfig) => createEvalRecipe(config);
