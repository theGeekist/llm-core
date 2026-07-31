import type { PromptTemplate as LlamaIndexPromptTemplate } from "@llamaindex/core/prompts";
import { sanitizeAdapterMetadata } from "../../../shared/native-metadata";
import { preparePromptTemplate, type PromptTemplate } from "../../../../features/model/public";

interface LlamaIndexPromptMetadata {
  readonly promptType?: string;
  readonly metadata?: unknown;
}

export interface LlamaIndexPromptInput {
  readonly prompt: LlamaIndexPromptTemplate;
  readonly name?: string;
}

export const fromLlamaIndexPromptTemplate = ({
  prompt,
  name,
}: LlamaIndexPromptInput): PromptTemplate => {
  const native = prompt as LlamaIndexPromptTemplate & LlamaIndexPromptMetadata;
  if (typeof native.template !== "string") {
    throw new TypeError("LlamaIndex prompt templates require a string template.");
  }
  return preparePromptTemplate({
    name: name ?? native.promptType ?? "llamaindex.prompt",
    template: native.template,
    inputs: native.vars().map((variable) => ({
      name: variable,
      type: "string",
      required: true,
    })),
    ...(native.metadata === undefined
      ? {}
      : {
          metadata: {
            "org.llamaindex": sanitizeAdapterMetadata(native.metadata),
          },
        }),
  });
};
