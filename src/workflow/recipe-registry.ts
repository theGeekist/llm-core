// References: docs/implementation-plan.md#L25-L27,L66-L70; docs/recipes-and-plugins.md
import { createMemoryCache } from "../adapters";

import type { RecipeContract, RecipeName } from "./types";

const OUTCOMES_DEFAULT: RecipeContract["outcomes"] = ["ok", "paused", "error"];
const OUTCOMES_NO_HITL: RecipeContract["outcomes"] = ["ok", "error"];

const CAP_MODEL = "model";
const CAP_TOOLS = "tools";
const CAP_RETRIEVER = "retriever";
const CAP_EVALUATOR = "evaluator";
const CAP_HITL = "hitl";
const CAP_RECIPE = "recipe";
const CAP_EMBEDDER = "embedder";

const ARTEFACT_ANSWER_TEXT = "answer.text";
const ARTEFACT_ANSWER_CONFIDENCE = "answer.confidence";
const PLUGIN_MODEL_OPENAI = "model.openai";
const PLUGIN_TRACE_CONSOLE = "trace.console";
const PLUGIN_TOOLS_WEB = "tools.web";
const PLUGIN_RETRIEVER_VECTOR = "retriever.vector";
const PLUGIN_RETRIEVER_RERANK = "retriever.rerank";
const PLUGIN_EVALS_RUBRIC = "evals.rubric";
const PLUGIN_EVALS_CONFIDENCE = "evals.confidence";
const PLUGIN_DATASET_EMIT = "dataset.emit";
const PLUGIN_HITL_PAUSE = "hitl.pauseResume";
const PLUGIN_CACHE_MEMORY = "adapter.cache.memory";
const PLUGIN_RECIPE_AGENT = "recipe.agent";
const PLUGIN_EMBEDDER_DEFAULT = "model.embedder";

const MODEL_OPENAI = { model: { name: "openai" } };
const TRACE_CONSOLE = { trace: { sink: "console" } };
const TOOLS_WEB = { tools: ["web.search"] };
const RETRIEVER_VECTOR = { retriever: { type: "vector" } };
const EVALS_RUBRIC = { evaluator: { type: "rubric" } };
const EVALS_CONFIDENCE = { evaluator: { type: "confidence" } };
const DATASET_EMIT = { dataset: { emit: true } };
const HITL_DEFAULT = { hitl: { adapter: "default" } };
const EMBEDDER_DEFAULT = { embedder: { name: "default" } };

const registry = {
  agent: {
    name: "agent",
    artefactKeys: [
      "plan",
      "tool.calls",
      "tool.results",
      ARTEFACT_ANSWER_TEXT,
      ARTEFACT_ANSWER_CONFIDENCE,
    ],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforePlan", "afterToolExec", "beforeAnswer"],
    minimumCapabilities: [CAP_MODEL, CAP_TOOLS],
    helperKinds: [],
    defaultPlugins: [
      { key: PLUGIN_MODEL_OPENAI, capabilities: MODEL_OPENAI },
      { key: PLUGIN_TOOLS_WEB, capabilities: TOOLS_WEB },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
  rag: {
    name: "rag",
    artefactKeys: [
      "retrieval.query",
      "retrieval.set",
      "retrieval.reranked",
      "citations",
      ARTEFACT_ANSWER_TEXT,
      ARTEFACT_ANSWER_CONFIDENCE,
    ],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforeRetrieve", "afterRetrieve", "beforeAnswer"],
    minimumCapabilities: [CAP_RETRIEVER, CAP_MODEL],
    helperKinds: [],
    defaultPlugins: [
      { key: PLUGIN_RETRIEVER_VECTOR, capabilities: RETRIEVER_VECTOR },
      { key: PLUGIN_RETRIEVER_RERANK, requires: [CAP_RETRIEVER] },
      { key: PLUGIN_MODEL_OPENAI, capabilities: MODEL_OPENAI },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
  eval: {
    name: "eval",
    artefactKeys: ["eval.candidates", "eval.scores", "eval.winner", "eval.report", "dataset.rows"],
    outcomes: OUTCOMES_NO_HITL,
    extensionPoints: ["init", "beforeGenerate", "afterScore", "beforeReport"],
    minimumCapabilities: [CAP_MODEL, CAP_EVALUATOR],
    helperKinds: [],
    defaultPlugins: [
      { key: PLUGIN_MODEL_OPENAI, capabilities: MODEL_OPENAI },
      { key: PLUGIN_EVALS_RUBRIC, capabilities: EVALS_RUBRIC },
      { key: PLUGIN_DATASET_EMIT, capabilities: DATASET_EMIT },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
  "hitl-gate": {
    name: "hitl-gate",
    artefactKeys: ["answer.draft", ARTEFACT_ANSWER_CONFIDENCE, "gate.decision", "hitl.packet"],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforeGate", "afterGate", "beforeFinalize"],
    minimumCapabilities: [CAP_MODEL, CAP_EVALUATOR, CAP_HITL],
    helperKinds: [],
    supportsResume: true,
    defaultPlugins: [
      { key: PLUGIN_CACHE_MEMORY, adapters: { cache: createMemoryCache() } },
      { key: PLUGIN_MODEL_OPENAI, capabilities: MODEL_OPENAI },
      { key: PLUGIN_EVALS_CONFIDENCE, capabilities: EVALS_CONFIDENCE },
      { key: PLUGIN_HITL_PAUSE, capabilities: HITL_DEFAULT },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
  loop: {
    name: "loop",
    artefactKeys: ["loop.iterations", "loop.result", "loop.terminationReason"],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforeIteration", "afterIteration", "beforeTerminate"],
    minimumCapabilities: [CAP_MODEL, CAP_RECIPE],
    helperKinds: [],
    defaultPlugins: [
      { key: PLUGIN_RECIPE_AGENT, capabilities: { recipe: { name: "agent" } } },
      { key: PLUGIN_MODEL_OPENAI, capabilities: MODEL_OPENAI },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
  ingest: {
    name: "ingest",
    artefactKeys: ["ingest.chunks", "ingest.embeddings", "ingest.upserted"],
    outcomes: OUTCOMES_NO_HITL,
    extensionPoints: ["init", "beforeChunk", "afterUpsert"],
    minimumCapabilities: [CAP_RETRIEVER, CAP_EMBEDDER],
    helperKinds: [],
    defaultPlugins: [
      { key: PLUGIN_RETRIEVER_VECTOR, capabilities: RETRIEVER_VECTOR },
      { key: PLUGIN_EMBEDDER_DEFAULT, capabilities: EMBEDDER_DEFAULT },
      { key: PLUGIN_TRACE_CONSOLE, capabilities: TRACE_CONSOLE },
    ],
  },
} as const satisfies Record<RecipeName, RecipeContract>;

type RecipeEntry<N extends RecipeName> = RecipeContract & { name: N };

const overrides: Partial<Record<RecipeName, RecipeContract>> = {};

const withName = <N extends RecipeName>(name: N, contract: RecipeContract): RecipeEntry<N> => ({
  ...contract,
  name,
});

export const registerRecipe = <N extends RecipeName>(contract: RecipeEntry<N>) => {
  overrides[contract.name] = contract;
};

export const getRecipe = <N extends RecipeName>(name: N): RecipeEntry<N> => {
  const override = overrides[name];
  if (override) {
    return withName(name, override);
  }
  return registry[name] as unknown as RecipeEntry<N>;
};
