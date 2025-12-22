import type { AdapterMessageContent, AdapterModel, AdapterModelResult } from "../types";
import { ModelCall, ModelUsage } from "../modeling";
import { toQueryText } from "../retrieval-query";

const toContentText = (content: AdapterMessageContent) =>
  typeof content === "string" ? content : toQueryText(content);

const resolvePromptText = (messages?: AdapterModelResult["messages"], prompt?: string) => {
  if (messages && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last) {
      return toContentText(last.content ?? "");
    }
  }
  return prompt ?? "";
};

const createResultText = (text: string) => (text ? `builtin:${text}` : "builtin:");

export const createBuiltinModel = (): AdapterModel => ({
  generate(call) {
    const prepared = ModelCall.prepare(call);
    const baseText = resolvePromptText(prepared.messages, prepared.prompt);
    const diagnostics = [...prepared.diagnostics];
    let result: AdapterModelResult = {
      text: createResultText(baseText),
      diagnostics,
    };
    if (prepared.normalizedSchema) {
      const output = {};
      result = {
        ...result,
        output,
        text: JSON.stringify(output),
      };
    }
    ModelUsage.warnIfMissing(diagnostics, result.usage, "builtin");
    return result;
  },
});
