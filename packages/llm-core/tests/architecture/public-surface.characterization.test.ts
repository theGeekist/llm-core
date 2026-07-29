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
import * as recipes from "../../src/recipes/index";
import * as interaction from "../../src/interaction/index";
import * as diagnostics from "../../src/shared/diagnostics";

const PUBLIC_SURFACE: ReadonlyArray<{ subpath: string; source: string }> = [
  { subpath: ".", source: "index.ts" },
  { subpath: "./workflow", source: "src/workflow/index.ts" },
  { subpath: "./functional", source: "src/functional/index.ts" },
  { subpath: "./adapters", source: "src/adapters/index.ts" },
  { subpath: "./adapters/ai-sdk", source: "src/adapters/ai-sdk/index.ts" },
  { subpath: "./adapters/ai-sdk-ui", source: "src/adapters/ai-sdk-ui/index.ts" },
  { subpath: "./adapters/assistant-ui", source: "src/adapters/assistant-ui/index.ts" },
  {
    subpath: "./adapters/openai-chatkit",
    source: "src/adapters/openai-chatkit/index.ts",
  },
  { subpath: "./adapters/nlux-ui", source: "src/adapters/nlux-ui/index.ts" },
  { subpath: "./adapters/langchain", source: "src/adapters/langchain/index.ts" },
  { subpath: "./adapters/llamaindex", source: "src/adapters/llamaindex/index.ts" },
  { subpath: "./adapters/primitives", source: "src/adapters/primitives/index.ts" },
  { subpath: "./recipes", source: "src/recipes/index.ts" },
  { subpath: "./interaction", source: "src/interaction/index.ts" },
  { subpath: "./diagnostics", source: "src/shared/diagnostics.ts" },
];

const PUBLIC_NAMESPACES: Readonly<Record<string, object>> = {
  ".": root,
  "./workflow": workflow,
  "./functional": functional,
  "./adapters": adapters,
  "./adapters/ai-sdk": aiSdk,
  "./adapters/ai-sdk-ui": aiSdkUi,
  "./adapters/assistant-ui": assistantUi,
  "./adapters/openai-chatkit": openaiChatkit,
  "./adapters/nlux-ui": nluxUi,
  "./adapters/langchain": langchain,
  "./adapters/llamaindex": llamaindex,
  "./adapters/primitives": primitives,
  "./recipes": recipes,
  "./interaction": interaction,
  "./diagnostics": diagnostics,
};

const packageJson = (await Bun.file(
  new URL("../../package.json", import.meta.url),
).json()) as { exports: Record<string, unknown> };

describe("public package surface", () => {
  for (const { subpath, source } of PUBLIC_SURFACE) {
    test(`${subpath} remains exported from ${source}`, async () => {
      expect(packageJson.exports[subpath]).toBeDefined();
      expect(await Bun.file(new URL(`../../${source}`, import.meta.url)).exists()).toBe(true);
      expect(PUBLIC_NAMESPACES[subpath]).toBeDefined();
    });
  }
});
