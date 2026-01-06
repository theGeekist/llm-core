import { tool as defineTool } from "@langchain/core/tools";
import type { AdapterCallContext, Tool } from "../types";
import { identity, maybeMap, type MaybePromise } from "../../maybe";
import { reportDiagnostics, validateToolInput } from "../input-validation";
import {
  adapterParamsToJsonSchema,
  normalizeObjectSchema,
  toJsonSchema,
  toSchema,
} from "../schema";

type LangChainToolLike<TInput = unknown, TOutput = unknown> = {
  name: string;
  description?: string;
  schema?: unknown;
  invoke: (input: TInput) => MaybePromise<TOutput>;
};

type LangChainToolSchema = Parameters<typeof defineTool>[1] extends { schema: infer S } ? S : never;

export function fromLangChainTool<TInput, TOutput>(tool: LangChainToolLike<TInput, TOutput>): Tool {
  const inputSchema = toSchema(tool.schema);
  const adapterShape: Tool = {
    name: tool.name,
    description: tool.description,
    inputSchema,
  };
  function execute(input: unknown, context?: AdapterCallContext) {
    const diagnostics = validateToolInput(adapterShape, input);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return null;
    }
    return maybeMap(identity, tool.invoke(input as TInput));
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema,
    execute,
  };
}

export function toLangChainTool(adapterTool: Tool) {
  const inputSchema =
    adapterTool.inputSchema ??
    toSchema(adapterTool.params ? adapterParamsToJsonSchema(adapterTool.params) : undefined);
  const schema = (
    inputSchema
      ? inputSchema.kind === "zod"
        ? inputSchema.jsonSchema
        : normalizeObjectSchema(toJsonSchema(inputSchema)).schema
      : adapterParamsToJsonSchema()
  ) as LangChainToolSchema;
  const execute = adapterTool.execute
    ? (input: unknown) => adapterTool.execute?.(input)
    : (input: unknown) => input;
  return defineTool(execute, {
    name: adapterTool.name,
    description: adapterTool.description ?? `${adapterTool.name} tool`,
    schema,
  });
}
