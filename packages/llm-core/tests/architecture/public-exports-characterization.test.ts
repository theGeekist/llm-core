import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as agent from "../../src/agent/index";
import * as agentRuntime from "../../src/agent/runtime";
import * as adapterCatalogue from "../../src/composition/capability-bindings/catalogue-public";
import * as adapterCatalogueRuntime from "../../src/composition/capability-bindings/runtime-public";
import * as control from "../../src/control/index";
import * as toolRuntime from "../../src/tools/runtime";
import * as workflow from "../../src/workflow/index";
import type {
  AgentDefinition,
  AgentEvent,
  AgentResult,
  ConversationEvent,
  ConversationSnapshot,
  ConversationState,
  ConversationStore,
  Tool,
  ToolCall,
  ToolConfig,
  WorkflowExecutionPlan,
} from "../../index";

type _PortableRootTypes = [
  AgentDefinition,
  AgentEvent,
  AgentResult,
  Tool,
  ToolConfig,
  ToolCall,
  WorkflowExecutionPlan,
  ConversationEvent,
  ConversationSnapshot,
  ConversationState,
  ConversationStore,
];

describe("ADR-016 curated exports", () => {
  test("keeps the root contract and specification oriented", () => {
    expect(Object.keys(root).sort()).toEqual([
      "compileSpecification",
      "defineTool",
      "loadSpecification",
      "reviewSpecification",
    ]);
  });

  test("does not publish a concrete runner or workflow executor", () => {
    expect(Object.keys(agent)).toEqual([]);
    expect(Object.keys(workflow)).toEqual([]);
    expect(agentRuntime).not.toHaveProperty("createLocalAgentRunner");
    expect(agentRuntime).not.toHaveProperty("createModelToolAgentProgram");
    expect(agentRuntime).not.toHaveProperty("createCapabilityCandidateCatalog");
    expect(agentRuntime).not.toHaveProperty("acquireCapabilityBindings");
    expect(adapterCatalogue).toHaveProperty("createCapabilityCandidateCatalog");
    expect(adapterCatalogueRuntime).toHaveProperty("acquireCapabilityBindings");
    expect(adapterCatalogueRuntime).toHaveProperty("registerCapabilityInvocation");
    expect(adapterCatalogueRuntime).toHaveProperty("executeWithQualifiedRetry");
  });

  test("publishes only the qualified AI SDK provider front", () => {
    expect(Object.keys(aiSdk).sort()).toEqual([
      "AI_SDK7_AUTHORITY",
      "AI_SDK7_OPERATION_DISPOSITIONS",
      "AI_SDK_EXTENSION_NAMESPACE",
      "AI_SDK_SUPPORTED_VERSION",
      "createAiSdk7Model",
      "createAiSdkEmbedder",
      "createAiSdkReranker",
      "createInMemoryAiSdk7ToolCallCorrelationStore",
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

  test("publishes controlled effects through the Tools runtime front", () => {
    expect(control).not.toHaveProperty("executeControlledTool");
    expect(toolRuntime).toHaveProperty("executeControlledTool");
  });
});
