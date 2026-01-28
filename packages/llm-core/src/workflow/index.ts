import { collectAdapters as collectAdaptersImpl } from "./adapters.ts";
import { getAdapters as getAdaptersImpl } from "./context.ts";
import { createRuntime as createRuntimeImpl } from "./runtime.ts";
import {
  hasAdapter as hasAdapterImpl,
  validateAdapters as validateAdaptersImpl,
} from "./adapter-validation.ts";
import { isCapabilitySatisfied as isCapabilitySatisfiedImpl } from "./capability-checks.ts";
import { createBuilder as createBuilderImpl } from "./builder.ts";
import { createContractView as createContractViewImpl } from "./contract.ts";
import { buildExplainSnapshot as buildExplainSnapshotImpl } from "./explain.ts";
import {
  createStreamingModel as createStreamingModelImpl,
  createStreamingModelForInteraction as createStreamingModelForInteractionImpl,
} from "./stream.ts";
import {
  getRecipe as getRecipeImpl,
  registerRecipe as registerRecipeImpl,
} from "./recipe-registry.ts";
import { Outcome as OutcomeImpl } from "./outcome.ts";
import type { RecipeName } from "./types";

export const collectAdapters = collectAdaptersImpl;
export const getAdapters = getAdaptersImpl;
export const createRuntime = createRuntimeImpl;
export const hasAdapter = hasAdapterImpl;
export const validateAdapters = validateAdaptersImpl;
export const isCapabilitySatisfied = isCapabilitySatisfiedImpl;
export const createBuilder = createBuilderImpl;
export const createContractView = createContractViewImpl;
export const buildExplainSnapshot = buildExplainSnapshotImpl;
export const createStreamingModel = createStreamingModelImpl;
export const createStreamingModelForInteraction = createStreamingModelForInteractionImpl;
export const getRecipe = getRecipeImpl;
export const registerRecipe = registerRecipeImpl;
export const Outcome = OutcomeImpl;

export const Workflow = {
  recipe: <N extends RecipeName>(name: N) => createBuilder(name),
};
export type { OutcomeSummary } from "./outcome.ts";
export type {
  AgentInput,
  Outcome as OutcomeType,
  Plugin,
  RecipeContract,
  RecipeName,
  Runtime,
} from "./types";
export type {
  AdapterBundle,
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterRequirement,
  AdapterResume,
  AdapterResumeRequest,
  AdapterResumeResult,
  AdapterResumeReturn,
  AdapterTraceEvent,
  EventStream,
  EventStreamEvent,
  StreamEvent,
  Blob,
  Document,
  DocumentLoader,
  DocumentTransformer,
  Embedder,
  KVStore,
  MaybeAsyncIterable,
  MaybePromise,
  Memory,
  Message,
  MessageContent,
  MessagePart,
  MessageRole,
  ModelCall,
  ModelResult,
  PromptSchema,
  PromptTemplate,
  Reranker,
  RetrievalQuery,
  RetrievalResult,
  Retriever,
  Schema,
  Storage,
  StructuredContent,
  TextSplitter,
  Thread,
  Tool,
  ToolCall,
  ToolParam,
  ToolResult,
  Turn,
} from "#adapters";
