import type { PromptTemplate as LlamaindexPromptTemplate } from "@llamaindex/core/prompts";
import type { PromptSchema, PromptTemplate } from "../types";

const DEFAULT_NAME = "llama.prompt";

type PromptMeta = {
  promptType?: string;
  metadata?: Record<string, unknown>;
};

const toInputs = (variables: string[]): PromptSchema["inputs"] =>
  variables.map((variable) => ({
    name: variable,
    type: "string",
    required: true,
  }));

export function fromLlamaIndexPromptTemplate(
  prompt: LlamaindexPromptTemplate,
  name?: string,
): PromptTemplate {
  const meta = prompt as PromptMeta;
  const resolvedName = name ?? meta.promptType ?? DEFAULT_NAME;

  return {
    name: resolvedName,
    template: prompt.template,
    schema: {
      name: resolvedName,
      inputs: toInputs(prompt.vars()),
    },
    metadata: meta.metadata,
  };
}
