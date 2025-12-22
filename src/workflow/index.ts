// References: docs/implementation-plan.md#L22-L64

import { createBuilder } from "./builder.ts";
import type { RecipeName } from "./types";

export const Workflow = {
  recipe: <N extends RecipeName>(name: N) => createBuilder(name),
};

export { createBuilder } from "./builder.ts";
export { createRuntime } from "./runtime.ts";
export { collectAdapters } from "./adapters.ts";
export { getAdapters } from "./context.ts";
export { hasAdapter, validateAdapters } from "./adapter-validation.ts";
export { isCapabilitySatisfied } from "./capability-checks.ts";
export { registerRecipe, getRecipe } from "./recipe-registry.ts";
export { createContractView } from "./contract.ts";
export { buildExplainSnapshot } from "./explain.ts";
export { Outcome } from "./outcome.ts";
export type { Plugin, RecipeName, RecipeContract, Outcome as OutcomeType } from "./types";
export type {
  AdapterBundle,
  AdapterDiagnostic,
  AdapterDocument,
  AdapterResume,
  AdapterResumeRequest,
  AdapterResumeResult,
  AdapterResumeReturn,
  AdapterMessage,
  AdapterMessageContent,
  AdapterMessagePart,
  AdapterMessageRole,
  AdapterStructuredContent,
  AdapterModelCall,
  AdapterModelResult,
  AdapterRetrievalResult,
  AdapterSchema,
  AdapterStorage,
  AdapterStreamChunk,
  AdapterTool,
  AdapterToolCall,
  AdapterToolParam,
  AdapterToolResult,
  AdapterTraceEvent,
  AdapterTraceSink,
  AdapterPromptTemplate,
  AdapterPromptSchema,
  AdapterStructuredResult,
  AdapterTextSplitter,
  AdapterEmbedder,
  AdapterRetriever,
  AdapterRetrievalQuery,
  AdapterReranker,
  AdapterDocumentLoader,
  AdapterDocumentTransformer,
  AdapterMemory,
  AdapterThread,
  AdapterTurn,
  AdapterKVStore,
  AdapterMaybePromise,
  AdapterBlob,
} from "../adapters";
