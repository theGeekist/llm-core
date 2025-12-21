// References: docs/stage-7.md (normalized adapter contracts)

import type { AdapterBundle } from "../adapters/types";
import type { Plugin } from "./types";
import { getEffectivePlugins } from "./plugins/effective";

const mergeLists = <T>(left: T[] | undefined, right: T[] | undefined) =>
  right ? [...(left ?? []), ...right] : left;

const replaceIfDefined = <T>(current: T | undefined, next: T | undefined) =>
  next === undefined ? current : next;

const mergeIfDefined = <T>(current: T[] | undefined, next: T[] | undefined) =>
  next === undefined ? current : mergeLists(current, next);

const mergeAdapterBundle = (
  target: AdapterBundle,
  next: AdapterBundle,
  mode: Plugin["mode"],
): AdapterBundle => {
  if (mode === "override") {
    return { ...next };
  }
  return {
    documents: mergeIfDefined(target.documents, next.documents),
    messages: mergeIfDefined(target.messages, next.messages),
    tools: mergeIfDefined(target.tools, next.tools),
    prompts: mergeIfDefined(target.prompts, next.prompts),
    schemas: mergeIfDefined(target.schemas, next.schemas),
    textSplitter: replaceIfDefined(target.textSplitter, next.textSplitter),
    embedder: replaceIfDefined(target.embedder, next.embedder),
    retriever: replaceIfDefined(target.retriever, next.retriever),
    reranker: replaceIfDefined(target.reranker, next.reranker),
    loader: replaceIfDefined(target.loader, next.loader),
    transformer: replaceIfDefined(target.transformer, next.transformer),
    memory: replaceIfDefined(target.memory, next.memory),
    storage: replaceIfDefined(target.storage, next.storage),
    kv: replaceIfDefined(target.kv, next.kv),
  };
};

export const collectAdapters = (plugins: Plugin[]) => {
  const effective = getEffectivePlugins(plugins);
  let bundle: AdapterBundle = {};

  for (const plugin of effective) {
    if (!plugin.adapters) {
      continue;
    }
    bundle = mergeAdapterBundle(bundle, plugin.adapters, plugin.mode);
  }

  return bundle;
};
