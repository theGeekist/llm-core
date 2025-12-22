import { tool as defineTool } from "@langchain/core/tools";
import type { AdapterMaybePromise, AdapterTool } from "../types";
import { identity, mapMaybe } from "../../maybe";
import { normalizeObjectSchema, toAdapterSchema, toJsonSchema } from "../schema";
import { adapterParamsToJsonSchema } from "../tool-params-schema";

type LangChainToolLike<TInput = unknown, TOutput = unknown> = {
  name: string;
  description?: string;
  schema?: unknown;
  invoke: (input: TInput) => AdapterMaybePromise<TOutput>;
};

type LangChainToolSchema = Parameters<typeof defineTool>[1] extends { schema: infer S } ? S : never;

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

export function toLangChainTool(adapterTool: AdapterTool) {
  const inputSchema =
    adapterTool.inputSchema ??
    toAdapterSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const schema = (
    inputSchema
      ? inputSchema.kind === "zod"
        ? inputSchema.jsonSchema
        : normalizeObjectSchema(toJsonSchema(inputSchema)).schema
      : adapterParamsToJsonSchema()
  ) as LangChainToolSchema;
  const execute = adapterTool.execute ?? ((input: unknown) => input);
  return defineTool(execute, {
    name: adapterTool.name,
    description: adapterTool.description ?? `${adapterTool.name} tool`,
    schema,
  });
}
