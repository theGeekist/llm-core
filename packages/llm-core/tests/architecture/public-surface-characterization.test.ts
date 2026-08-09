import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as contracts from "../../src/contracts/public";
import * as model from "../../src/features/model/public";
import * as modelRuntime from "../../src/features/model/runtime";
import * as tools from "../../src/features/tooling/public";
import * as toolsRuntime from "../../src/tools/runtime";
import * as control from "../../src/control/index";
import * as controlRuntime from "../../src/control/runtime";
import * as evidence from "../../src/features/evidence/public";
import * as state from "../../src/features/state/public";
import * as context from "../../src/features/context/public";
import * as artifacts from "../../src/features/artifacts/public";
import * as evaluation from "../../src/features/evaluation/public";
import * as agent from "../../src/agent/index";
import * as agentRuntime from "../../src/agent/runtime";
import * as workflow from "../../src/workflow/index";
import * as conversation from "../../src/conversation/index";
import * as interaction from "../../src/interaction/index";
import * as retrieval from "../../src/features/retrieval/public";
import * as indexing from "../../src/features/indexing/public";
import * as storage from "../../src/features/storage/public";
import * as memory from "../../src/features/memory/public";
import * as media from "../../src/features/media/public";
import * as specifications from "../../src/specifications/index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";
import * as a2a from "../../src/adapters/protocols/a2a/index";
import * as mcp from "../../src/adapters/protocols/mcp/index";

const PUBLIC_SURFACE = {
  ".": root,
  "./contracts": contracts,
  "./model": model,
  "./model/runtime": modelRuntime,
  "./tools": tools,
  "./tools/runtime": toolsRuntime,
  "./control": control,
  "./control/runtime": controlRuntime,
  "./evidence": evidence,
  "./state": state,
  "./context": context,
  "./artifacts": artifacts,
  "./evaluation": evaluation,
  "./agent": agent,
  "./agent/runtime": agentRuntime,
  "./workflow": workflow,
  "./conversation": conversation,
  "./interaction": interaction,
  "./retrieval": retrieval,
  "./indexing": indexing,
  "./storage": storage,
  "./memory": memory,
  "./media": media,
  "./specifications": specifications,
  "./adapters/ai-sdk": aiSdk,
  "./adapters/ai-sdk-ui": aiSdkUi,
  "./adapters/assistant-ui": assistantUi,
  "./adapters/openai-chatkit": openaiChatkit,
  "./adapters/nlux-ui": nluxUi,
  "./a2a": a2a,
  "./mcp": mcp,
} as const;

const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as {
  exports: Record<string, unknown>;
  version: string;
};

describe("ADR-016 public package surface", () => {
  test("publishes the corrected contract and integration fronts", () => {
    expect(packageJson.version).toBe("2.0.0");
    expect(Object.keys(packageJson.exports)).toEqual(Object.keys(PUBLIC_SURFACE));
    expect(Object.values(PUBLIC_SURFACE).every(Boolean)).toBe(true);
    expect("rebindValidatedToolCall" in tools).toBe(false);
  });

  test("keeps specification graph and authority internals private", () => {
    for (const name of [
      "SpecificationGraph",
      "AcceptedSpecificationHandle",
      "CompilationAuthoritySnapshot",
      "verifyCompilationAuthority",
    ]) {
      expect(name in specifications).toBe(false);
    }
  });

  test("does not retain legacy public subpaths", () => {
    for (const subpath of [
      "./adapters",
      "./adapters/langchain",
      "./adapters/llamaindex",
      "./adapters/primitives",
      "./recipes",
      "./diagnostics",
    ]) {
      expect(packageJson.exports[subpath]).toBeUndefined();
    }
  });
});
