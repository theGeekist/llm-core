import type { AdapterDiagnostic, ModelCall } from "./types";
import { normalizeObjectSchema, toJsonSchema } from "./schema";

export type ModelValidation = {
  diagnostics: AdapterDiagnostic[];
  allowTools: boolean;
  normalizedSchema?: ReturnType<typeof normalizeObjectSchema>;
};

export type ModelValidationOptions = {
  supportsToolChoice?: boolean;
};

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

const appendDiagnostic = (diagnostics: AdapterDiagnostic[], message: string, data?: unknown) => {
  diagnostics.push(warn(message, data));
};

const readSchema = (schema: ModelCall["responseSchema"], diagnostics: AdapterDiagnostic[]) => {
  if (!schema) {
    return undefined;
  }
  try {
    return normalizeObjectSchema(toJsonSchema(schema));
  } catch (error) {
    appendDiagnostic(diagnostics, "response_schema_invalid", {
      error: error instanceof Error ? error.message : error,
    });
    return normalizeObjectSchema({ type: "object", properties: {} });
  }
};

const maybeWarnPromptIgnored = (call: ModelCall, diagnostics: AdapterDiagnostic[]) => {
  if (!call.messages || call.prompt === undefined) {
    return;
  }
  appendDiagnostic(diagnostics, "prompt_ignored_when_messages_present");
};

const maybeWarnToolChoiceNotSupported = (
  call: ModelCall,
  diagnostics: AdapterDiagnostic[],
  supportsToolChoice: boolean,
) => {
  if (supportsToolChoice || !call.toolChoice) {
    return;
  }
  appendDiagnostic(diagnostics, "tool_choice_not_supported");
};

const maybeWarnToolsIgnored = (call: ModelCall, diagnostics: AdapterDiagnostic[]) => {
  if (!call.responseSchema || !call.tools?.length) {
    return;
  }
  appendDiagnostic(diagnostics, "tools_ignored_for_response_schema", {
    tools: call.tools.map((tool) => tool.name),
  });
};

const maybeWarnNonObjectSchema = (
  normalizedSchema: ReturnType<typeof normalizeObjectSchema> | undefined,
  diagnostics: AdapterDiagnostic[],
) => {
  if (!normalizedSchema || normalizedSchema.isObject) {
    return;
  }
  appendDiagnostic(diagnostics, "response_schema_not_object");
};

const maybeWarnToolChoiceIgnored = (call: ModelCall, diagnostics: AdapterDiagnostic[]) => {
  if (!call.responseSchema || !call.toolChoice) {
    return;
  }
  appendDiagnostic(diagnostics, "tool_choice_ignored_for_response_schema");
};

const maybeWarnMissingInput = (call: ModelCall, diagnostics: AdapterDiagnostic[]) => {
  const hasMessages = Array.isArray(call.messages) && call.messages.length > 0;
  const hasPrompt = typeof call.prompt === "string" && call.prompt.trim().length > 0;
  if (hasMessages || hasPrompt) {
    return;
  }
  appendDiagnostic(diagnostics, "model_input_missing");
};

export const validateModelCall = (
  call: ModelCall,
  options: ModelValidationOptions = {},
): ModelValidation => {
  const diagnostics: AdapterDiagnostic[] = [];
  const allowTools = !call.responseSchema;
  const normalizedSchema = readSchema(call.responseSchema, diagnostics);
  const supportsToolChoice = options.supportsToolChoice !== false;

  maybeWarnPromptIgnored(call, diagnostics);
  maybeWarnToolChoiceNotSupported(call, diagnostics, supportsToolChoice);
  maybeWarnToolsIgnored(call, diagnostics);
  maybeWarnNonObjectSchema(normalizedSchema, diagnostics);
  maybeWarnToolChoiceIgnored(call, diagnostics);
  maybeWarnMissingInput(call, diagnostics);

  return {
    diagnostics,
    allowTools,
    normalizedSchema,
  };
};
