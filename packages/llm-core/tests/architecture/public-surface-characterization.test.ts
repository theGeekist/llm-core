import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
import * as langchain from "../../src/adapters/langchain/index";
import * as llamaindex from "../../src/adapters/llamaindex/index";
import * as adapterCatalogue from "../../src/composition/capability-bindings/catalogue-public";
import * as adapterCatalogueRuntime from "../../src/composition/capability-bindings/runtime-public";
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
  "./adapters/langchain": langchain,
  "./adapters/llamaindex": llamaindex,
  "./adapters/catalogue": adapterCatalogue,
  "./adapters/catalogue/runtime": adapterCatalogueRuntime,
  "./adapters/ai-sdk-ui": aiSdkUi,
  "./adapters/assistant-ui": assistantUi,
  "./adapters/openai-chatkit": openaiChatkit,
  "./adapters/nlux-ui": nluxUi,
  "./a2a": a2a,
  "./mcp": mcp,
} as const;

const PUBLIC_FRONT_CLASSIFICATION = {
  "portable-kernel": [
    ".",
    "./contracts",
    "./model",
    "./tools",
    "./control",
    "./evidence",
    "./state",
    "./context",
    "./artifacts",
    "./evaluation",
    "./agent",
    "./workflow",
    "./conversation",
    "./interaction",
    "./retrieval",
    "./indexing",
    "./storage",
    "./memory",
    "./media",
    "./specifications",
  ],
  "runtime-spi": ["./model/runtime", "./tools/runtime", "./control/runtime", "./agent/runtime"],
  "qualified-adapter": [
    "./adapters/ai-sdk",
    "./adapters/langchain",
    "./adapters/llamaindex",
    "./adapters/catalogue",
    "./adapters/catalogue/runtime",
    "./adapters/ai-sdk-ui",
    "./adapters/assistant-ui",
    "./adapters/openai-chatkit",
    "./adapters/nlux-ui",
  ],
  protocol: ["./a2a", "./mcp"],
} as const;

const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as {
  exports: Record<string, unknown>;
  main?: unknown;
  module?: unknown;
  types?: unknown;
  version: string;
};

const rootTypeScript = await Bun.file(new URL("../../../../tsconfig.json", import.meta.url)).text();

const packageTypeScript = await Bun.file(new URL("../../tsconfig.json", import.meta.url)).text();

describe("ADR-016 public package surface", () => {
  test("publishes the corrected contract and integration fronts", () => {
    expect(packageJson.version).toBe("2.0.0");
    expect(Object.keys(packageJson.exports)).toEqual(Object.keys(PUBLIC_SURFACE));
    expect(Object.values(PUBLIC_SURFACE).every(Boolean)).toBe(true);
    expect("rebindValidatedToolCall" in tools).toBe(false);
  });

  test("classifies every manifest export under one public owner", () => {
    const classified: string[] = Object.values(PUBLIC_FRONT_CLASSIFICATION).flat();

    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(Object.keys(packageJson.exports).sort());
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

  test("does not retain retired public subpaths", () => {
    for (const subpath of [
      "./functional",
      "./adapters",
      "./adapters/primitives",
      "./recipes",
      "./diagnostics",
    ]) {
      expect(packageJson.exports[subpath]).toBeUndefined();
    }

    expect(rootTypeScript).not.toContain('"@geekist/llm-core/functional"');
    expect(packageTypeScript).not.toContain('"@geekist/llm-core/functional"');
    expect(existsSync(resolve(import.meta.dir, "../../src/functional/index.ts"))).toBe(false);
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.module).toBeUndefined();
    expect(packageJson.types).toBeUndefined();
  });
});
