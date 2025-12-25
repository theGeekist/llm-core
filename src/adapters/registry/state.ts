import type { AdapterBundle } from "../types";
type AdapterConstructName = keyof AdapterBundle | string;
export type RegistryState = {
  adapters: AdapterBundle;
  diagnostics: import("../types").AdapterDiagnostic[];
  providers: Record<string, string>;
  constructs: Record<string, unknown>;
};

// When adding a new construct, update AdapterBundle + this list.
const bundleKeys = new Set<keyof AdapterBundle>([
  "documents",
  "messages",
  "tools",
  "model",
  "image",
  "trace",
  "prompts",
  "schemas",
  "textSplitter",
  "embedder",
  "retriever",
  "reranker",
  "loader",
  "transformer",
  "memory",
  "speech",
  "storage",
  "transcription",
  "kv",
  "vectorStore",
  "constructs",
]);

export const isBundleKey = (key: AdapterConstructName): key is keyof AdapterBundle =>
  bundleKeys.has(key as keyof AdapterBundle) && key !== "constructs";

export const createState = (
  diagnostics: import("../types").AdapterDiagnostic[],
): RegistryState => ({
  adapters: {},
  diagnostics: [...diagnostics],
  providers: {},
  constructs: {},
});

export const addAdapterValue = (
  state: RegistryState,
  construct: AdapterConstructName,
  value: unknown,
) => {
  if (isBundleKey(construct)) {
    const bundle = state.adapters as Record<string, unknown>;
    bundle[construct] = value;
    return;
  }
  state.constructs[construct] = value;
};
