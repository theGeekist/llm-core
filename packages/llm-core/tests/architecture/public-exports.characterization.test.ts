import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as workflow from "../../src/workflow/index";
import * as functional from "../../src/functional/index";
import * as adapters from "../../src/adapters/index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
import * as langchain from "../../src/adapters/langchain/index";
import * as llamaindex from "../../src/adapters/llamaindex/index";
import * as primitives from "../../src/adapters/primitives/index";
import * as recipesNamespace from "../../src/recipes/index";
import * as interaction from "../../src/interaction/index";
import * as diagnostics from "../../src/shared/diagnostics";
import {
  Outcome,
  createAgentRuntime,
  createInteractionHandle,
  createInteractionSession,
  recipes,
  runInteractionRequest,
} from "../../index";
import type {
  AgentRuntime,
  AgentRuntimeInput,
  AgentRuntimeOptions,
  AgentRuntimeOverrides,
  AnyRecipeHandle,
  DiagnosticEntry,
  InteractionHandle,
  InteractionSession,
  OutcomeType,
  Plugin,
  RecipeContract,
  RecipeHandle,
  RecipeName,
  RecipeRunOverrides,
  Runtime,
  TraceEvent,
} from "../../index";

type _AssertAnyRecipeHandle = AnyRecipeHandle;
type _AssertRecipeHandle = RecipeHandle<RecipeName, unknown>;
type _AssertRecipeRunOverrides = RecipeRunOverrides;
type _AssertAgentRuntime = AgentRuntime;
type _AssertAgentRuntimeInput = AgentRuntimeInput;
type _AssertAgentRuntimeOptions = AgentRuntimeOptions;
type _AssertAgentRuntimeOverrides = AgentRuntimeOverrides;
type _AssertInteractionHandle = InteractionHandle;
type _AssertInteractionSession = InteractionSession;
type _AssertOutcomeType = OutcomeType;
type _AssertPlugin = Plugin;
type _AssertRecipeContract = RecipeContract;
type _AssertRecipeName = RecipeName;
type _AssertRuntime = Runtime;
type _AssertDiagnosticEntry = DiagnosticEntry;
type _AssertTraceEvent = TraceEvent;

describe("public value exports", () => {
  test(". value exports", () => {
    expect(Object.keys(root).sort()).toMatchInlineSnapshot(`
      [
        "Outcome",
        "createAgentRuntime",
        "createInteractionHandle",
        "createInteractionSession",
        "recipes",
        "runInteractionRequest",
      ]
    `);
  });
  test("./workflow value exports", () => {
    expect(Object.keys(workflow).sort()).toMatchInlineSnapshot(`
      [
        "Outcome",
      ]
    `);
  });
  test("./functional value exports", () => {
    expect(Object.keys(functional).sort()).toMatchInlineSnapshot(`
      [
        "bindFirst",
        "collectStep",
        "compose",
        "composeK",
        "isPromiseLike",
        "maybeAll",
        "maybeChain",
        "maybeMap",
        "maybeMapOr",
        "maybeTap",
        "maybeToStep",
        "maybeTry",
        "toUndefined",
      ]
    `);
  });
  test("./adapters value exports", () => {
    expect(Object.keys(adapters).sort()).toMatchInlineSnapshot(`
      [
        "Adapter",
        "ModelCallHelper",
        "ModelHelper",
        "ModelUsageHelper",
        "Tooling",
        "adapterParamTypeToJsonType",
        "adapterParamsToJsonSchema",
        "createAdapterRegistry",
        "createAiSdkChatTransport",
        "createAiSdkInteractionEventStream",
        "createAiSdkInteractionSink",
        "createAiSdkUiMessageChunkMapper",
        "createAiSdkWebSocketChatTransport",
        "createAssistantUiCommandMapper",
        "createAssistantUiInteractionEventStream",
        "createAssistantUiInteractionSink",
        "createAssistantUiInteractionStream",
        "createBuiltinAdapters",
        "createBuiltinModel",
        "createBuiltinRetriever",
        "createBuiltinTools",
        "createBuiltinTrace",
        "createCacheFromKVStore",
        "createChatKitEventMapper",
        "createChatKitInteractionEventStream",
        "createChatKitInteractionSink",
        "createEventStreamFanout",
        "createEventStreamFromTraceSink",
        "createInteractionEventDeliverySink",
        "createInteractionEventDeliveryStream",
        "createInteractionEventEmitterStream",
        "createMemoryCache",
        "createNluxChatAdapter",
        "fromAiSdkCacheStore",
        "fromAiSdkEmbeddings",
        "fromAiSdkImageModel",
        "fromAiSdkMemory",
        "fromAiSdkMessage",
        "fromAiSdkMessages",
        "fromAiSdkModel",
        "fromAiSdkPrompt",
        "fromAiSdkReranker",
        "fromAiSdkSpeechModel",
        "fromAiSdkTool",
        "fromAiSdkTranscriptionModel",
        "fromLangChainCallbackHandler",
        "fromLangChainDocument",
        "fromLangChainDocuments",
        "fromLangChainEmbeddings",
        "fromLangChainEventStream",
        "fromLangChainIndexing",
        "fromLangChainLoader",
        "fromLangChainMemory",
        "fromLangChainMessage",
        "fromLangChainMessages",
        "fromLangChainModel",
        "fromLangChainOutputParser",
        "fromLangChainPromptTemplate",
        "fromLangChainReranker",
        "fromLangChainRetriever",
        "fromLangChainStore",
        "fromLangChainStoreCache",
        "fromLangChainStructuredQuery",
        "fromLangChainTextSplitter",
        "fromLangChainTool",
        "fromLangChainTransformer",
        "fromLangChainVectorStore",
        "fromLangGraphInterrupt",
        "fromLlamaIndexDocument",
        "fromLlamaIndexDocumentStore",
        "fromLlamaIndexEmbeddings",
        "fromLlamaIndexKVStoreCache",
        "fromLlamaIndexLoader",
        "fromLlamaIndexMemory",
        "fromLlamaIndexMessage",
        "fromLlamaIndexMessages",
        "fromLlamaIndexModel",
        "fromLlamaIndexNode",
        "fromLlamaIndexNodes",
        "fromLlamaIndexPromptTemplate",
        "fromLlamaIndexQueryEngine",
        "fromLlamaIndexReranker",
        "fromLlamaIndexResponseSynthesizer",
        "fromLlamaIndexRetriever",
        "fromLlamaIndexTextSplitter",
        "fromLlamaIndexTool",
        "fromLlamaIndexTraceSink",
        "fromLlamaIndexTransformer",
        "fromLlamaIndexVectorStore",
        "fromLlamaIndexWorkflowContext",
        "hasKeys",
        "isArray",
        "isNonEmptyArray",
        "isNull",
        "isRecord",
        "isString",
        "parseAssistantTransportRequest",
        "readAdapterRequirements",
        "reportDiagnostics",
        "selectModel",
        "toAdapterTrace",
        "toChatKitThreadId",
        "toCoreMessagesFromAssistantCommands",
        "toJsonSchema",
        "toLangChainDocument",
        "toLangChainStreamEvents",
        "toLlamaIndexDocument",
        "toLlamaIndexStreamEvents",
        "toMessageContent",
        "toModelStreamEvents",
        "toPromptInputSchema",
        "toQueryText",
        "toSchema",
        "validateAdapterRequirements",
        "validateEmbedderBatchInput",
        "validateEmbedderInput",
        "validateImageInput",
        "validateIndexingInput",
        "validateKvKeys",
        "validateKvPairs",
        "validateMemoryLoadInput",
        "validateMemorySaveInput",
        "validateMemoryTurn",
        "validateModelCall",
        "validatePromptInputs",
        "validateQueryEngineInput",
        "validateRerankerInput",
        "validateResponseSynthesizerInput",
        "validateRetrieverInput",
        "validateSpeechInput",
        "validateStorageKey",
        "validateTextSplitterBatchInput",
        "validateTextSplitterInput",
        "validateThreadId",
        "validateToolInput",
        "validateTranscriptionInput",
        "validateTransformerInput",
        "validateVectorStoreDeleteInput",
        "validateVectorStoreUpsertInput",
      ]
    `);
  });
  test("./adapters/ai-sdk value exports", () => {
    expect(Object.keys(aiSdk).sort()).toMatchInlineSnapshot(`
      [
        "fromAiSdkCacheStore",
        "fromAiSdkEmbeddings",
        "fromAiSdkImageModel",
        "fromAiSdkMemory",
        "fromAiSdkMessage",
        "fromAiSdkMessages",
        "fromAiSdkModel",
        "fromAiSdkPrompt",
        "fromAiSdkReranker",
        "fromAiSdkSpeechModel",
        "fromAiSdkTool",
        "fromAiSdkTranscriptionModel",
        "toModelStreamEvents",
      ]
    `);
  });
  test("./adapters/ai-sdk-ui value exports", () => {
    expect(Object.keys(aiSdkUi).sort()).toMatchInlineSnapshot(`
      [
        "createAiSdkChatTransport",
        "createAiSdkInteractionEventStream",
        "createAiSdkInteractionSink",
        "createAiSdkUiMessageChunkMapper",
        "createAiSdkWebSocketChatTransport",
      ]
    `);
  });
  test("./adapters/assistant-ui value exports", () => {
    expect(Object.keys(assistantUi).sort()).toMatchInlineSnapshot(`
      [
        "createAssistantUiCommandMapper",
        "createAssistantUiInteractionEventStream",
        "createAssistantUiInteractionSink",
        "createAssistantUiInteractionStream",
        "parseAssistantTransportRequest",
        "toCoreMessagesFromAssistantCommands",
      ]
    `);
  });
  test("./adapters/openai-chatkit value exports", () => {
    expect(Object.keys(openaiChatkit).sort()).toMatchInlineSnapshot(`
      [
        "createChatKitEventMapper",
        "createChatKitInteractionEventStream",
        "createChatKitInteractionSink",
        "toChatKitThreadId",
      ]
    `);
  });
  test("./adapters/nlux-ui value exports", () => {
    expect(Object.keys(nluxUi).sort()).toMatchInlineSnapshot(`
      [
        "createNluxChatAdapter",
      ]
    `);
  });
  test("./adapters/langchain value exports", () => {
    expect(Object.keys(langchain).sort()).toMatchInlineSnapshot(`
      [
        "fromLangChainCallbackHandler",
        "fromLangChainDocument",
        "fromLangChainDocuments",
        "fromLangChainEmbeddings",
        "fromLangChainEventStream",
        "fromLangChainIndexing",
        "fromLangChainLoader",
        "fromLangChainMemory",
        "fromLangChainMessage",
        "fromLangChainMessages",
        "fromLangChainModel",
        "fromLangChainOutputParser",
        "fromLangChainPromptTemplate",
        "fromLangChainReranker",
        "fromLangChainRetriever",
        "fromLangChainStore",
        "fromLangChainStoreCache",
        "fromLangChainStructuredQuery",
        "fromLangChainTextSplitter",
        "fromLangChainTool",
        "fromLangChainTransformer",
        "fromLangChainVectorStore",
        "fromLangGraphInterrupt",
        "toLangChainDocument",
        "toLangChainStreamEvents",
      ]
    `);
  });
  test("./adapters/llamaindex value exports", () => {
    expect(Object.keys(llamaindex).sort()).toMatchInlineSnapshot(`
      [
        "fromLlamaIndexDocument",
        "fromLlamaIndexDocumentStore",
        "fromLlamaIndexEmbeddings",
        "fromLlamaIndexKVStoreCache",
        "fromLlamaIndexLoader",
        "fromLlamaIndexMemory",
        "fromLlamaIndexMessage",
        "fromLlamaIndexMessages",
        "fromLlamaIndexModel",
        "fromLlamaIndexNode",
        "fromLlamaIndexNodes",
        "fromLlamaIndexPromptTemplate",
        "fromLlamaIndexQueryEngine",
        "fromLlamaIndexReranker",
        "fromLlamaIndexResponseSynthesizer",
        "fromLlamaIndexRetriever",
        "fromLlamaIndexTextSplitter",
        "fromLlamaIndexTool",
        "fromLlamaIndexTraceSink",
        "fromLlamaIndexTransformer",
        "fromLlamaIndexVectorStore",
        "fromLlamaIndexWorkflowContext",
        "toLlamaIndexDocument",
        "toLlamaIndexMessageContent",
        "toLlamaIndexStreamEvents",
      ]
    `);
  });
  test("./adapters/primitives value exports", () => {
    expect(Object.keys(primitives).sort()).toMatchInlineSnapshot(`
      [
        "createBuiltinModel",
        "createBuiltinRetriever",
        "createBuiltinTools",
        "createBuiltinTrace",
        "createCacheFromKVStore",
        "createEventStreamFanout",
        "createEventStreamFromTraceSink",
        "createInteractionEventDeliverySink",
        "createInteractionEventDeliveryStream",
        "createInteractionEventEmitterStream",
        "createMemoryCache",
      ]
    `);
  });
  test("./recipes value exports", () => {
    expect(Object.keys(recipesNamespace).sort()).toMatchInlineSnapshot(`
      [
        "inputs",
        "recipes",
        "toAgentInput",
        "toChatSimpleInput",
        "toEvalInput",
        "toHitlInput",
        "toIngestInput",
        "toLoopInput",
        "toRagInput",
      ]
    `);
  });
  test("./interaction value exports", () => {
    expect(Object.keys(interaction).sort()).toMatchInlineSnapshot(`
      [
        "createAgentRuntime",
        "createInteractionHandle",
        "createInteractionSession",
        "hasRecipeId",
        "resolveAgentExecutionProfile",
        "resolveInteractionRecipeId",
        "runInteractionRequest",
      ]
    `);
  });
  test("./diagnostics value exports", () => {
    expect(Object.keys(diagnostics).sort()).toMatchInlineSnapshot(`
      [
        "createAdapterDiagnostic",
        "createContractDiagnostic",
        "createLifecycleDiagnostic",
        "createPipelineDiagnostic",
        "createRecipeDiagnostic",
        "createRequirementDiagnostic",
        "createResumeDiagnostic",
        "hasErrorDiagnostics",
        "normalizeDiagnostics",
      ]
    `);
  });
});

test("root named value exports remain available", () => {
  expect([
    recipes,
    createAgentRuntime,
    createInteractionHandle,
    createInteractionSession,
    runInteractionRequest,
    Outcome,
  ]).toHaveLength(6);
});
