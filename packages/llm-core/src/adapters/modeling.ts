import type { AdapterDiagnostic, Message, Model, ModelCall } from "./types";
import { validateModelCall, type ModelValidationOptions } from "./model-validation";
import { warnDiagnostic } from "./utils";

export type ModelCallPrepared = {
  diagnostics: AdapterDiagnostic[];
  allowTools: boolean;
  normalizedSchema?: ReturnType<typeof validateModelCall>["normalizedSchema"];
  messages?: Message[];
  prompt?: string;
};

export type DiagnosticGroups = {
  user: AdapterDiagnostic[];
  provider: AdapterDiagnostic[];
  system: AdapterDiagnostic[];
};

const providerDiagnostics = new Set(["provider_warning"]);
const userDiagnostics = new Set([
  "prompt_ignored_when_messages_present",
  "tool_choice_ignored_for_response_schema",
  "tools_ignored_for_response_schema",
  "response_schema_not_object",
  "response_schema_invalid",
  "model_input_missing",
]);

const resolvePrompt = (call: ModelCall) => {
  if (call.messages !== undefined) {
    return { messages: call.messages ?? [], prompt: undefined };
  }
  return { messages: undefined, prompt: call.prompt ?? "" };
};

export const ModelCallHelper = {
  prepare(call: ModelCall, options?: ModelValidationOptions): ModelCallPrepared {
    const validation = validateModelCall(call, options);
    const resolved = resolvePrompt(call);
    return {
      diagnostics: validation.diagnostics,
      allowTools: validation.allowTools,
      normalizedSchema: validation.normalizedSchema,
      messages: resolved.messages,
      prompt: resolved.prompt,
    };
  },
  shouldUseSchema(call: ModelCall) {
    return Boolean(call.responseSchema);
  },
  shouldUseTools(call: ModelCall) {
    return Boolean(call.tools?.length) && !call.responseSchema;
  },
  groupDiagnostics(diagnostics: AdapterDiagnostic[]): DiagnosticGroups {
    const grouped: DiagnosticGroups = { user: [], provider: [], system: [] };
    for (const diagnostic of diagnostics) {
      if (providerDiagnostics.has(diagnostic.message)) {
        grouped.provider.push(diagnostic);
        continue;
      }
      if (userDiagnostics.has(diagnostic.message)) {
        grouped.user.push(diagnostic);
        continue;
      }
      grouped.system.push(diagnostic);
    }
    return grouped;
  },
};

export const ModelHelper = {
  create(generate: Model["generate"]): Model {
    return { generate };
  },
};

export const ModelUsageHelper = {
  warnIfMissing(diagnostics: AdapterDiagnostic[], usage: unknown, provider?: string): void {
    if (usage) {
      return;
    }
    diagnostics.push(warnDiagnostic("usage_unavailable", provider ? { provider } : undefined));
  },
};
