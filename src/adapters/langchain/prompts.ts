import type { PromptTemplate as LangChainPromptTemplate } from "@langchain/core/prompts";
import type { PromptSchema, PromptTemplate } from "../types";

const DEFAULT_NAME = "langchain.prompt";

const toTemplateString = (template: LangChainPromptTemplate["template"]) =>
  typeof template === "string" ? template : JSON.stringify(template);

const toInputs = (variables: string[]): PromptSchema["inputs"] =>
  variables.map((variable) => ({
    name: variable,
    type: "string",
    required: true,
  }));

export function fromLangChainPromptTemplate(
  prompt: LangChainPromptTemplate,
  name: string = DEFAULT_NAME,
): PromptTemplate {
  return {
    name,
    template: toTemplateString(prompt.template),
    schema: {
      name,
      inputs: toInputs(prompt.inputVariables as string[]),
    },
    metadata: prompt.metadata,
  };
}
