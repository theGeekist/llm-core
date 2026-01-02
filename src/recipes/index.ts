export * from "./simple-chat";
export * from "./rag-chat";
export * from "./handle";
export * from "./agentic";
export * from "./rag";
export * from "./hitl";
export * from "./ingest";
export * from "./compress";
export * from "./eval";
export * from "./loop";
export * from "./events";
export * from "./state";
export * from "./rollback";
export type * from "./types";

import { simpleChat } from "./simple-chat";
import { ragChat } from "./rag-chat";
import {
  createAgentRecipe,
  createAgentPlanningRecipe,
  createAgentToolsRecipe,
  createAgentMemoryRecipe,
  createAgentFinalizeRecipe,
} from "./agentic";
import { createRagRecipe, createRagRetrievalRecipe, createRagSynthesisRecipe } from "./rag";
import { createHitlRecipe } from "./hitl";
import { createIngestRecipe } from "./ingest";
import { createCompressRecipe } from "./compress";
import { createEvalRecipe } from "./eval";
import { createLoopRecipe } from "./loop";

export const recipes = {
  agent: createAgentRecipe,
  "agent.planning": createAgentPlanningRecipe,
  "agent.tools": createAgentToolsRecipe,
  "agent.memory": createAgentMemoryRecipe,
  "agent.finalize": createAgentFinalizeRecipe,
  rag: createRagRecipe,
  "rag.retrieval": createRagRetrievalRecipe,
  "rag.synthesis": createRagSynthesisRecipe,
  hitl: createHitlRecipe,
  ingest: createIngestRecipe,
  compress: createCompressRecipe,
  eval: createEvalRecipe,
  loop: createLoopRecipe,
  "chat.simple": simpleChat,
  "chat.rag": ragChat,
};
