import { describe, expect, test } from "bun:test";

import * as root from "../../index";
import * as functional from "../../src/functional/index";
import * as contracts from "../../src/contracts/public";
import * as model from "../../src/features/model/public";
import * as tools from "../../src/features/tooling/public";
import * as control from "../../src/control/index";
import * as evidence from "../../src/features/evidence/public";
import * as state from "../../src/features/state/public";
import * as context from "../../src/features/context/public";
import * as artifacts from "../../src/features/artifacts/public";
import * as evaluation from "../../src/features/evaluation/public";
import * as agent from "../../src/agent/index";
import * as workflow from "../../src/workflow/index";
import * as interaction from "../../src/interaction/index";
import * as aiSdk from "../../src/adapters/ai-sdk/index";
import * as aiSdkUi from "../../src/adapters/ai-sdk-ui/index";
import * as assistantUi from "../../src/adapters/assistant-ui/index";
import * as openaiChatkit from "../../src/adapters/openai-chatkit/index";
import * as nluxUi from "../../src/adapters/nlux-ui/index";

const PUBLIC_SURFACE = {
  ".": root,
  "./functional": functional,
  "./contracts": contracts,
  "./model": model,
  "./tools": tools,
  "./control": control,
  "./evidence": evidence,
  "./state": state,
  "./context": context,
  "./artifacts": artifacts,
  "./evaluation": evaluation,
  "./agent": agent,
  "./workflow": workflow,
  "./interaction": interaction,
  "./adapters/ai-sdk": aiSdk,
  "./adapters/ai-sdk-ui": aiSdkUi,
  "./adapters/assistant-ui": assistantUi,
  "./adapters/openai-chatkit": openaiChatkit,
  "./adapters/nlux-ui": nluxUi,
} as const;

const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as {
  exports: Record<string, unknown>;
  version: string;
};

describe("ADR-008 public package surface", () => {
  test("publishes exactly the nineteen v2 subpaths", () => {
    expect(packageJson.version).toBe("2.0.0");
    expect(Object.keys(packageJson.exports)).toEqual(Object.keys(PUBLIC_SURFACE));
    expect(Object.values(PUBLIC_SURFACE).every(Boolean)).toBe(true);
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
