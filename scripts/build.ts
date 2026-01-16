import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

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
  "ai",
  "@ai-sdk/*",
  "@ai-sdk-tools/*",
  "@assistant-ui/*",
  "assistant-stream",
  "@langchain/*",
  "langchain",
  "@llamaindex/*",
  "llamaindex",
  "openai",
  "ollama",
  "ollama-ai-provider-v2",
  "@openai/chatkit",
  "@nlux/core",
  "@mastra/core",
  "@node-llm/core",
  "@unified-llm/core",
  "zod",
  "zod-to-json-schema",
  "@wpkernel/pipeline",
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
      target: isEsm ? "browser" : "node",
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
