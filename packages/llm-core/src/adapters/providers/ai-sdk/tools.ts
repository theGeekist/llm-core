import { jsonSchema, tool, type ToolApprovalConfiguration, type ToolSet } from "ai";
import { isJsonValue, type InvocationContext, type JsonValue } from "#contracts";
import type { ModelRequest, ToolDeclaration } from "../../../features/model/public";
import type { AiSdk7ToolApprovalPort } from "./types";

type JsonSchemaInput = Parameters<typeof jsonSchema>[0];

export const toAiSdk7Tools = (declarations?: ToolDeclaration[]): ToolSet | undefined =>
  declarations?.length
    ? Object.fromEntries(
        declarations.map((declaration) => [
          declaration.name,
          tool({
            description: declaration.description,
            inputSchema: jsonSchema(
              (declaration.parameters ?? {
                type: "object",
                additionalProperties: true,
              }) as JsonSchemaInput,
            ),
            // Deliberately no execute function. Effects must return through the
            // llm-core tool-control orchestrator and durable receipt journal.
          }),
        ]),
      )
    : undefined;

export const toAiSdk7ToolApproval = (input: {
  request: ModelRequest;
  context: InvocationContext;
  classify?: AiSdk7ToolApprovalPort;
}): ToolApprovalConfiguration<ToolSet, never> | undefined =>
  input.request.tools?.length
    ? async ({ toolCall }) => {
        if (!isJsonValue(toolCall.input)) {
          return "denied";
        }
        const argumentsValue: JsonValue = toolCall.input;
        return input.classify
          ? input.classify({
              request: input.request,
              context: input.context,
              toolName: toolCall.toolName,
              arguments: argumentsValue,
            })
          : "user-approval";
      }
    : undefined;
