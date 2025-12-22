import type { AdapterDiagnostic, AdapterMessage, AdapterModel, AdapterModelCall } from "./types";
import { validateModelCall, type AdapterModelValidationOptions } from "./model-validation";

export type ModelCallPrepared = {
  diagnostics: AdapterDiagnostic[];
  allowTools: boolean;
  normalizedSchema?: ReturnType<typeof validateModelCall>["normalizedSchema"];
  messages?: AdapterMessage[];
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
]);

const resolvePrompt = (call: AdapterModelCall) => {
  if (call.messages !== undefined) {
    return { messages: call.messages ?? [], prompt: undefined };
  }
  return { messages: undefined, prompt: call.prompt ?? "" };
};

export const ModelCall = {
  prepare(call: AdapterModelCall, options?: AdapterModelValidationOptions): ModelCallPrepared {
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
  shouldUseSchema(call: AdapterModelCall) {
    return Boolean(call.responseSchema);
  },
  shouldUseTools(call: AdapterModelCall) {
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

export const Model = {
  create(generate: AdapterModel["generate"]): AdapterModel {
    return { generate };
  },
};

const warn = (message: string, data?: unknown): AdapterDiagnostic => ({
  level: "warn",
  message,
  data,
});

export const ModelUsage = {
  warnIfMissing(diagnostics: AdapterDiagnostic[], usage: unknown, provider?: string): void {
    if (usage) {
      return;
    }
    diagnostics.push(warn("usage_unavailable", provider ? { provider } : undefined));
  },
};
