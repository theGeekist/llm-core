import type { AdapterMaybePromise, AdapterTool } from "../types";
import { identity, mapMaybe } from "../maybe";
import { toAdapterSchema } from "../schema";

type LangChainToolLike<TInput = unknown, TOutput = unknown> = {
  name: string;
  description?: string;
  schema?: unknown;
  invoke: (input: TInput) => AdapterMaybePromise<TOutput>;
};

export function fromLangChainTool<TInput, TOutput>(
  tool: LangChainToolLike<TInput, TOutput>,
): AdapterTool {
  function execute(input: unknown) {
    return mapMaybe(tool.invoke(input as TInput), identity);
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toAdapterSchema(tool.schema),
    execute,
  };
}
