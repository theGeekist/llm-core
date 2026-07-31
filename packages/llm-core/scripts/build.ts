import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import type { BunPlugin } from "bun";

type BuildOptions = {
  outdir: string;
  root: string;
  target: "browser" | "node";
  splitting?: boolean;
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

const PUBLIC_ENTRY_POINTS = [
  "index.ts",
  "src/contracts/public.ts",
  "src/features/model/public.ts",
  "src/features/model/runtime.ts",
  "src/features/tooling/public.ts",
  "src/features/tooling/runtime.ts",
  "src/control/index.ts",
  "src/control/runtime.ts",
  "src/features/evidence/public.ts",
  "src/features/state/public.ts",
  "src/features/context/public.ts",
  "src/features/artifacts/public.ts",
  "src/features/evaluation/public.ts",
  "src/agent/index.ts",
  "src/agent/runtime.ts",
  "src/workflow/index.ts",
  "src/workflow/runtime.ts",
  "src/conversation/index.ts",
  "src/interaction/index.ts",
  "src/features/retrieval/public.ts",
  "src/features/indexing/public.ts",
  "src/features/storage/public.ts",
  "src/features/memory/public.ts",
  "src/features/media/public.ts",
  "src/adapters/ai-sdk/index.ts",
  "src/adapters/ai-sdk-ui/index.ts",
  "src/adapters/assistant-ui/index.ts",
  "src/adapters/openai-chatkit/index.ts",
  "src/adapters/nlux-ui/index.ts",
] as const;

const walkFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const declarationAliasTarget = (
  specifier: string,
  imports: Record<string, string>,
): string | null => {
  const exact = imports[specifier];
  if (exact) return exact;
  for (const [pattern, target] of Object.entries(imports)) {
    if (!pattern.endsWith("*") || !target.includes("*")) continue;
    const prefix = pattern.slice(0, -1);
    if (specifier.startsWith(prefix)) {
      return target.replace("*", specifier.slice(prefix.length));
    }
  }
  return null;
};

const rewriteDeclarationAliases = (rootDir: string, distDir: string): void => {
  const typesDir = resolve(distDir, "types");
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as {
    imports?: Record<string, string>;
  };
  const imports = packageJson.imports ?? {};
  for (const file of walkFiles(typesDir).filter((path) => path.endsWith(".d.ts"))) {
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(/(["'])(#[^"']+)\1/g, (match, quote, specifier: string) => {
      const target = declarationAliasTarget(specifier, imports);
      if (!target) return match;
      const declarationTarget = resolve(
        typesDir,
        target.replace(/^\.\//, "").replace(/\.ts$/, ".d.ts"),
      );
      let path = relative(dirname(file), declarationTarget)
        .split(sep)
        .join("/")
        .replace(/\.d\.ts$/, "");
      if (!path.startsWith(".")) path = `./${path}`;
      return `${quote}${path}${quote}`;
    });
    if (/["']#[^"']+["']/.test(rewritten)) {
      throw new Error(`Declaration retains a source-only alias: ${relative(rootDir, file)}`);
    }
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
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
      // Package-internal aliases must be resolved and bundled. Leaving them
      // external makes the published JavaScript fall back to the source-only
      // package.json imports map at runtime.
      if (args.path.startsWith("#")) {
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
    format: "esm",
    splitting: options.splitting ?? false,
    sourcemap: "external",
    external: EXTERNALS,
    plugins: [forceExternalPlugin],
  });

  logBuildMessages(result.logs);
  return result.success;
};

const run = async () => {
  const rootDir = process.cwd();
  const distDir = resolve(rootDir, "dist");
  const outdir = resolve(distDir, "esm");
  const phase = process.argv[2] ?? "emit";
  if (phase === "clean") {
    rmSync(distDir, { recursive: true, force: true });
    return;
  }
  if (phase !== "emit") {
    throw new TypeError(`Unknown build phase: ${phase}`);
  }
  let ok = true;

  const baseOptions: BuildOptions = {
    outdir,
    root: rootDir,
    target: "node",
    splitting: true,
  };

  for (const entry of PUBLIC_ENTRY_POINTS) {
    ok = (await runBuildEntry(resolve(rootDir, entry), baseOptions)) && ok;
  }

  if (!ok) {
    process.exit(1);
  }
  rewriteDeclarationAliases(rootDir, distDir);
};

await run();
