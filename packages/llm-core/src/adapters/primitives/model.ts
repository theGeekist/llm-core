import type { MessageContent, Model, ModelResult } from "../types";
import { ModelCallHelper, ModelUsageHelper } from "../modeling";
import { toQueryText } from "../retrieval-query";

const toContentText = (content: MessageContent) =>
  typeof content === "string" ? content : toQueryText(content);

const resolvePromptText = (messages?: ModelResult["messages"], prompt?: string) => {
  if (messages && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last) {
      return toContentText(last.content ?? "");
    }
  }
  return prompt ?? "";
};

const createResultText = (text: string) => (text ? `builtin:${text}` : "builtin:");

export const createBuiltinModel = (): Model => ({
  generate(call) {
    const prepared = ModelCallHelper.prepare(call);
    const baseText = resolvePromptText(prepared.messages, prepared.prompt);
    const diagnostics = [...prepared.diagnostics];
    let result: ModelResult = {
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
    ModelUsageHelper.warnIfMissing(diagnostics, result.usage, "builtin");
    return result;
  },
});
