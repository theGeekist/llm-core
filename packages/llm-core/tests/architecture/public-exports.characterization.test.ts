import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as agent from "../../src/agent/index";
import * as agentRuntime from "../../src/agent/runtime";
import * as control from "../../src/control/index";
import * as toolRuntime from "../../src/features/tooling/runtime";
import * as workflowRuntime from "../../src/workflow/runtime";
import type {
  Agent,
  AgentConfig,
  AgentEvent,
  AgentResult,
  AgentRun,
  Conversation,
  ConversationEvent,
  ConversationResult,
  ConversationRun,
  Tool,
  ToolCall,
  ToolConfig,
  Workflow,
  WorkflowConfig,
  WorkflowPause,
  WorkflowResult,
} from "../../index";

type _CommonRootTypes = [
  Agent,
  AgentConfig,
  AgentRun,
  AgentEvent,
  AgentResult,
  Tool,
  ToolConfig,
  ToolCall,
  Workflow<unknown, unknown>,
  WorkflowConfig<unknown, unknown>,
  WorkflowResult<unknown, unknown>,
  WorkflowPause<unknown, unknown>,
  Conversation,
  ConversationRun,
  ConversationEvent,
  ConversationResult,
];

describe("ADR-012 curated exports", () => {
  test("keeps the root on the four implemented common journeys", () => {
    expect(Object.keys(root).sort()).toEqual([
      "createAgent",
      "createConversation",
      "defineTool",
      "defineWorkflow",
    ]);
  });

  test("keeps runtime machinery on qualified fronts", () => {
    expect(Object.keys(agent).sort()).toEqual(["createAgent"]);
    expect(agentRuntime).toHaveProperty("createLocalAgentRunner");
    expect(agentRuntime).toHaveProperty("createCapabilityBindingCatalog");
    expect(agentRuntime).not.toHaveProperty("createCacheStoreAdapter");
    expect(agentRuntime).not.toHaveProperty("createConversationMessage");
    expect(agentRuntime).not.toHaveProperty("textDocument");
    expect(toolRuntime).toHaveProperty("createExecutableTool");
    expect(workflowRuntime).toHaveProperty("runWorkflow");
  });

  test("publishes only the qualified AI SDK provider front", () => {
    expect(Object.keys(aiSdk).sort()).toEqual([
      "AI_SDK7_SEMANTIC_LOSS",
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
