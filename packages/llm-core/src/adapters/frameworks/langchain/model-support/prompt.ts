import type { PromptTemplate as LangChainPromptTemplate } from "@langchain/core/prompts";
import { sanitizeAdapterMetadata } from "../../../shared/native-metadata";
import { preparePromptTemplate, type PromptTemplate } from "../../../../features/model/public";

export interface LangChainPromptInput {
  readonly prompt: LangChainPromptTemplate;
  readonly name?: string;
}

export const fromLangChainPromptTemplate = ({
  prompt,
  name = "langchain.prompt",
}: LangChainPromptInput): PromptTemplate => {
  if (typeof prompt.template !== "string") {
    throw new TypeError("LangChain prompt templates require lossless string templates.");
  }
  return preparePromptTemplate({
    name,
    template: prompt.template,
    inputs: prompt.inputVariables.map((variable) => ({
      name: variable,
      type: "string",
      required: true,
    })),
    ...(prompt.metadata === undefined
      ? {}
      : {
          metadata: {
            "dev.langchain": sanitizeAdapterMetadata(prompt.metadata),
          },
        }),
  });
};
