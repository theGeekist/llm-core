import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
import * as agent from "../../src/agent/index";
import * as control from "../../src/control/index";
import type {
  CapabilityBindingCatalog,
  CapabilityBindingResolutionOutcome,
  CapabilityBindingResolutionRequest,
  CacheStore,
  ConversationStore,
  Indexer,
  RegisteredRuntimeCapabilityBinding,
  Retriever,
  RuntimeCapabilityBinding,
} from "../../src/agent/index";
import type {
  ControlledToolExecutionOutcome,
  ExecuteControlledToolInput,
} from "../../src/control/index";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunner,
  AgentRunnerCapabilities,
  AgentRunRequest,
  AgentSpec,
  MaybeAsyncIterable,
  MaybePromise,
  PreparedAgentSpec,
  RunResult,
} from "../../index";

type _CuratedRootTypes = [
  AgentSpec,
  PreparedAgentSpec,
  AgentRunner,
  AgentRunnerCapabilities,
  AgentRun,
  AgentRunRequest,
  AgentRunEvent,
  RunResult,
  MaybePromise<unknown>,
  MaybeAsyncIterable<unknown>,
];

type _CompositionSurfaceTypes = [
  CapabilityBindingCatalog,
  CapabilityBindingResolutionRequest,
  CapabilityBindingResolutionOutcome,
  RuntimeCapabilityBinding<"retriever">,
  RegisteredRuntimeCapabilityBinding<"retriever">,
  Retriever,
  Indexer,
  CacheStore,
  ConversationStore,
  ExecuteControlledToolInput,
  ControlledToolExecutionOutcome,
];

describe("ADR-008 curated exports", () => {
  test("keeps the root minimal", () => {
    expect(Object.keys(root).sort()).toEqual(["createLocalAgentRunner", "prepareAgentSpec"]);
  });

  test("publishes only the v2 AI SDK provider front", () => {
    expect(Object.keys(aiSdk).sort()).toEqual([
      "AI_SDK7_SEMANTIC_LOSS",
      "AI_SDK_EXTENSION_NAMESPACE",
      "AI_SDK_SUPPORTED_VERSION",
      "createAiSdk7Model",
      "createAiSdkEmbedder",
      "createAiSdkReranker",
      "fromAiSdkImageModel",
      "fromAiSdkSpeechModel",
      "fromAiSdkTranscriptionModel",
    ]);
  });

  test("publishes qualified canonical UI projection fronts", () => {
    expect(Object.keys(aiSdkUi).sort()).toEqual([
      "createAiSdkUiProjectionMapper",
      "createAiSdkUiWebSocketTransport",
    ]);
    expect(Object.keys(assistantUi).sort()).toEqual([
      "createAssistantUiProjectionMapper",
      "parseAssistantUiInboundEvents",
    ]);
    expect(Object.keys(openaiChatkit)).toEqual(["createChatKitProjectionMapper"]);
    expect(Object.keys(nluxUi).sort()).toEqual([
      "createNluxChatAdapter",
      "createNluxProjectionMapper",
    ]);
  });

  test("publishes runner composition through the agent front", () => {
    for (const name of [
      "createCapabilityBindingCatalog",
      "capabilityIdForPort",
      "conversationId",
      "jsonStorageValue",
      "textDocument",
      "textRetrievalQuery",
    ]) {
      expect(agent).toHaveProperty(name);
    }
  });

  test("publishes controlled effects through the control front", () => {
    expect(control).toHaveProperty("executeControlledTool");
  });
});
