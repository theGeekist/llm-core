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
