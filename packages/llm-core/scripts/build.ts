import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";

type BuildFormat = "esm" | "cjs";

type BuildOptions = {
  format: BuildFormat;
  outdir: string;
  root: string;
  target: "browser" | "node";
  splitting?: boolean;
  naming?: { entry?: string; chunk?: string; asset?: string };
};

const EXTERNALS = [
  "assistant-stream",
  "assistant-stream/*",
  "@ai-sdk-tools/cache",
  "@ai-sdk-tools/cache/*",
  "@ai-sdk-tools/memory",
  "@ai-sdk-tools/memory/*",
  "@ai-sdk-tools/store",
  "@ai-sdk-tools/store/*",
  "@ai-sdk/anthropic",
  "@ai-sdk/anthropic/*",
  "@ai-sdk/langchain",
  "@ai-sdk/langchain/*",
  "@ai-sdk/openai",
  "@ai-sdk/openai/*",
  "@ai-sdk/provider",
  "@ai-sdk/provider/*",
  "@ai-sdk/provider-utils",
  "@ai-sdk/provider-utils/*",
  "@ai-sdk/react",
  "@ai-sdk/react/*",
  "@assistant-ui/react",
  "@assistant-ui/react/*",
  "@assistant-ui/react-ai-sdk",
  "@assistant-ui/react-ai-sdk/*",
  "@langchain/community",
  "@langchain/community/*",
  "@langchain/core",
  "@langchain/core/*",
  "@langchain/langgraph",
  "@langchain/langgraph/*",
  "@langchain/langgraph-checkpoint",
  "@langchain/langgraph-checkpoint/*",
  "@langchain/ollama",
  "@langchain/ollama/*",
  "@langchain/openai",
  "@langchain/openai/*",
  "@langchain/textsplitters",
  "@langchain/textsplitters/*",
  "@llamaindex/openai",
  "@llamaindex/openai/*",
  "@llamaindex/workflow",
  "@llamaindex/workflow/*",
  "@llamaindex/workflow-core",
  "@llamaindex/workflow-core/*",
  "@mastra/core",
  "@mastra/core/*",
  "@nlux/core",
  "@nlux/core/*",
  "@node-llm/core",
  "@node-llm/core/*",
  "@openai/chatkit",
  "@openai/chatkit/*",
  "@radix-ui/react-slot",
  "@radix-ui/react-slot/*",
  "@radix-ui/react-tooltip",
  "@radix-ui/react-tooltip/*",
  "@tailwindcss/postcss",
  "@tailwindcss/postcss/*",
  "@types/bun",
  "@types/bun/*",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/eslint-plugin/*",
  "@typescript-eslint/parser",
  "@typescript-eslint/parser/*",
  "@unified-llm/core",
  "@unified-llm/core/*",
  "ai",
  "ai/*",
  "autoprefixer",
  "autoprefixer/*",
  "class-variance-authority",
  "class-variance-authority/*",
  "clsx",
  "clsx/*",
  "eslint",
  "eslint/*",
  "eslint-config-prettier",
  "eslint-config-prettier/*",
  "eslint-plugin-sonarjs",
  "eslint-plugin-sonarjs/*",
  "langchain",
  "langchain/*",
  "llamaindex",
  "llamaindex/*",
  "lucide-react",
  "lucide-react/*",
  "markdown-it-mermaid",
  "markdown-it-mermaid/*",
  "mermaid",
  "mermaid/*",
  "ollama",
  "ollama/*",
  "ollama-ai-provider-v2",
  "ollama-ai-provider-v2/*",
  "openai",
  "openai/*",
  "postcss",
  "postcss/*",
  "prettier",
  "prettier/*",
  "remark-gfm",
  "remark-gfm/*",
  "tailwind-merge",
  "tailwind-merge/*",
  "tailwindcss",
  "tailwindcss/*",
  "vitepress",
  "vitepress/*",
  "vitepress-plugin-mermaid",
  "vitepress-plugin-mermaid/*",
  "vitepress-plugin-tabs",
  "vitepress-plugin-tabs/*",
  "zod",
  "zod/*",
  "zod-to-json-schema",
  "zod-to-json-schema/*",
];

const readAdapterEntryPoints = (rootDir: string) => {
  const adaptersDir = resolve(rootDir, "src/adapters");
  const entries: string[] = [];
  const items = readdirSync(adaptersDir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isDirectory()) {
      continue;
    }
    const entry = resolve(adaptersDir, item.name, "index.ts");
    if (!existsSync(entry)) {
      continue;
    }
    entries.push(entry);
  }
  return entries;
};

const logBuildMessages = (logs: Array<{ level?: string; message?: string }>) => {
  if (logs.length === 0) {
    return;
  }
  for (const log of logs) {
    if (log.level === "error") {
      console.error(log.message ?? "Build error");
      continue;
    }
    if (log.message) {
      console.warn(log.message);
    }
  }
};

const forceExternalPlugin: BunPlugin = {
  name: "force-external",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      // Allow relative imports
      if (args.path.startsWith(".")) {
        return null;
      }
      // Allow absolute imports (usually internal to Bun or system)
      if (args.path.startsWith("/")) {
        return null;
      }
      // Allow @wpkernel/pipeline
      if (args.path === "@wpkernel/pipeline" || args.path.startsWith("@wpkernel/pipeline/")) {
        return null;
      }
      // Externalize everything else
      return { path: args.path, external: true };
    });
  },
};

const runBuildEntry = async (entry: string, options: BuildOptions) => {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: options.outdir,
    root: options.root,
    target: options.target,
    format: options.format,
    splitting: options.splitting ?? false,
    sourcemap: "external",
    external: EXTERNALS,
    naming: options.naming,
    plugins: [forceExternalPlugin],
  });

  logBuildMessages(result.logs);
  return result.success;
};

const readFormats = (): BuildFormat[] => {
  const args = new Set(process.argv.slice(2));
  if (args.has("--esm")) {
    return ["esm"];
  }
  if (args.has("--cjs")) {
    return ["cjs"];
  }
  return ["esm", "cjs"];
};

const run = async () => {
  const rootDir = process.cwd();
  const formats = readFormats();
  let ok = true;

  for (const format of formats) {
    const isEsm = format === "esm";
    const outdir = resolve(rootDir, "dist", format);
    const baseOptions: BuildOptions = {
      format,
      outdir,
      root: rootDir,
      target: "node",
      splitting: isEsm,
      naming: isEsm
        ? undefined
        : {
            entry: "[dir]/[name].cjs",
            chunk: "[name]-[hash].cjs",
            asset: "[name]-[hash].[ext]",
          },
    };

    ok = (await runBuildEntry(resolve(rootDir, "index.ts"), baseOptions)) && ok;
    ok = (await runBuildEntry(resolve(rootDir, "src/interaction/index.ts"), baseOptions)) && ok;
    ok = (await runBuildEntry(resolve(rootDir, "src/shared/diagnostics.ts"), baseOptions)) && ok;
    ok = (await runBuildEntry(resolve(rootDir, "src/adapters/index.ts"), baseOptions)) && ok;
    for (const entry of readAdapterEntryPoints(rootDir)) {
      ok = (await runBuildEntry(entry, baseOptions)) && ok;
    }
    ok = (await runBuildEntry(resolve(rootDir, "src/workflow/index.ts"), baseOptions)) && ok;
  }

  if (!ok) {
    process.exit(1);
  }
};

await run();
