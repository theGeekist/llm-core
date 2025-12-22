import type { AdapterMaybePromise, AdapterTool, AdapterToolParam } from "./types";

export type ToolCreateInput = {
  name: string;
  description?: string;
  params?: AdapterToolParam[];
  inputSchema?: AdapterTool["inputSchema"];
  outputSchema?: AdapterTool["outputSchema"];
  execute?: (input: unknown) => AdapterMaybePromise<unknown>;
};

export const Tool = {
  param(
    name: string,
    type: string,
    options: { description?: string; required?: boolean } = {},
  ): AdapterToolParam {
    return {
      name,
      type,
      description: options.description,
      required: options.required,
    };
  },
  create(input: ToolCreateInput): AdapterTool {
    return {
      name: input.name,
      description: input.description,
      params: input.params,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      execute: input.execute,
    };
  },
};
