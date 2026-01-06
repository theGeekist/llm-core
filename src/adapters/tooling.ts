import type { AdapterCallContext, Tool, ToolParam } from "./types";
import { reportDiagnostics, validateToolInput } from "./input-validation";
import type { MaybePromise } from "../shared/maybe";

export type ToolCreateInput = {
  name: string;
  description?: string | null;
  params?: ToolParam[] | null;
  inputSchema?: Tool["inputSchema"];
  outputSchema?: Tool["outputSchema"];
  execute?: ((input: unknown, context?: AdapterCallContext) => MaybePromise<unknown>) | null;
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
      ? (value: unknown, context?: AdapterCallContext) => {
          const diagnostics = validateToolInput(
            {
              name: input.name,
              params: input.params,
              inputSchema: input.inputSchema,
              outputSchema: input.outputSchema,
            },
            value,
          );
          if (diagnostics.length > 0) {
            reportDiagnostics(context, diagnostics);
            return null;
          }
          return input.execute?.(value, context);
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
