import type { Tool, ToolParam } from "./types";
import { reportDiagnostics, validateToolInput } from "./input-validation";

export type ToolCreateInput = {
  name: string;
  description?: string | null;
  params?: ToolParam[] | null;
  inputSchema?: Tool["inputSchema"];
  outputSchema?: Tool["outputSchema"];
  execute?: Tool["execute"];
};

export const Tooling = {
  param(
    name: string,
    type: string,
    options: { description?: string; required?: boolean } = {},
  ): ToolParam {
    return {
      name,
      type,
      description: options.description,
      required: options.required,
    };
  },
  create(input: ToolCreateInput): Tool {
    const execute = input.execute
      ? ({ input: value, context }: Parameters<NonNullable<Tool["execute"]>>[0]) => {
          const diagnostics = validateToolInput(
            {
              name: input.name,
              params: input.params,
              inputSchema: input.inputSchema,
              outputSchema: input.outputSchema,
            },
            value,
          );
          if (reportDiagnostics(context, diagnostics)) {
            return null;
          }
          return input.execute?.({ input: value, context });
        }
      : null;
    return {
      name: input.name,
      description: input.description,
      params: input.params,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      execute,
    };
  },
};
