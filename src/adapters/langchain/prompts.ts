import type { PromptTemplate } from "@langchain/core/prompts";
import type { AdapterPromptSchema, AdapterPromptTemplate } from "../types";

const DEFAULT_NAME = "langchain.prompt";

const toTemplateString = (template: PromptTemplate["template"]) =>
  typeof template === "string" ? template : JSON.stringify(template);

const toInputs = (variables: string[]): AdapterPromptSchema["inputs"] =>
  variables.map((variable) => ({
    name: variable,
    type: "string",
    required: true,
  }));

export function fromLangChainPromptTemplate(
  prompt: PromptTemplate,
  name: string = DEFAULT_NAME,
): AdapterPromptTemplate {
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
