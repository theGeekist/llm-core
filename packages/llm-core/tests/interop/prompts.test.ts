import { describe, expect, it } from "bun:test";
import { PromptTemplate as LangChainPromptTemplate } from "@langchain/core/prompts";
import type { PromptTemplate as LlamaPromptTemplate } from "@llamaindex/core/prompts";
import type { PromptTemplate } from "#workflow";

const toPromptFromLangChain = (prompt: LangChainPromptTemplate): PromptTemplate => ({
  name: "langchain.prompt",
  template: String(prompt.template),
});

const toPromptFromLlama = (prompt: LlamaPromptTemplate): PromptTemplate => ({
  name: "llama.prompt",
  template: prompt.template,
});

describe("Interop prompts", () => {
  const TEMPLATE = "Hello {name}";

  it("maps LangChain PromptTemplate to PromptTemplate", () => {
    const prompt = new LangChainPromptTemplate({
      template: TEMPLATE,
      inputVariables: ["name"],
    });

    const adapted = toPromptFromLangChain(prompt);
    expect(adapted.template).toBe(TEMPLATE);
  });

  it("maps LlamaIndex PromptTemplate to PromptTemplate", () => {
    const prompt = {
      template: TEMPLATE,
      vars: () => ["name"],
      format: () => "",
      formatMessages: () => [],
      partialFormat: () => prompt,
    } as unknown as LlamaPromptTemplate;

    const adapted = toPromptFromLlama(prompt);
    expect(adapted.template).toBe(TEMPLATE);
  });
});
