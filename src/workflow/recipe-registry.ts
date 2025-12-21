// References: docs/implementation-plan.md#L25-L27,L66-L70; docs/recipes-and-plugins.md

import type { RecipeContract, RecipeName } from "./types";

const OUTCOMES_DEFAULT: RecipeContract["outcomes"] = ["ok", "needsHuman", "error"];
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
  },
  eval: {
    name: "eval",
    artefactKeys: ["eval.candidates", "eval.scores", "eval.winner", "eval.report", "dataset.rows"],
    outcomes: OUTCOMES_NO_HITL,
    extensionPoints: ["init", "beforeGenerate", "afterScore", "beforeReport"],
    minimumCapabilities: [CAP_MODEL, CAP_EVALUATOR],
    helperKinds: [],
  },
  "hitl-gate": {
    name: "hitl-gate",
    artefactKeys: ["answer.draft", ARTEFACT_ANSWER_CONFIDENCE, "gate.decision", "hitl.packet"],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforeGate", "afterGate", "beforeFinalize"],
    minimumCapabilities: [CAP_MODEL, CAP_EVALUATOR, CAP_HITL],
    helperKinds: [],
    supportsResume: true,
  },
  loop: {
    name: "loop",
    artefactKeys: ["loop.iterations", "loop.result", "loop.terminationReason"],
    outcomes: OUTCOMES_DEFAULT,
    extensionPoints: ["init", "beforeIteration", "afterIteration", "beforeTerminate"],
    minimumCapabilities: [CAP_MODEL, CAP_RECIPE],
    helperKinds: [],
  },
  ingest: {
    name: "ingest",
    artefactKeys: ["ingest.chunks", "ingest.embeddings", "ingest.upserted"],
    outcomes: OUTCOMES_NO_HITL,
    extensionPoints: ["init", "beforeChunk", "afterUpsert"],
    minimumCapabilities: [CAP_RETRIEVER, CAP_EMBEDDER],
    helperKinds: [],
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
