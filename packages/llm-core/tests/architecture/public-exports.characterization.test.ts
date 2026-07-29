import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
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
      "fromAiSdkImageModel",
      "fromAiSdkSpeechModel",
      "fromAiSdkTranscriptionModel",
    ]);
  });

  test("publishes qualified canonical UI projection fronts", () => {
    expect(Object.keys(aiSdkUi)).toEqual(["createAiSdkUiProjectionMapper"]);
    expect(Object.keys(assistantUi)).toEqual(["createAssistantUiProjectionMapper"]);
    expect(Object.keys(openaiChatkit)).toEqual(["createChatKitProjectionMapper"]);
    expect(Object.keys(nluxUi).sort()).toEqual([
      "createNluxChatAdapter",
      "createNluxProjectionMapper",
    ]);
  });
});
