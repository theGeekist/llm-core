import { describe, expect, it } from "bun:test";
import { PromptTemplate as LangChainPromptTemplate } from "@langchain/core/prompts";
import { fromLangChainPromptTemplate, fromLlamaIndexPromptTemplate } from "#adapters";
import { asLlamaPromptTemplate } from "./helpers";

describe("Adapter prompts", () => {
  const TEMPLATE = "Hello {name}";

  it("maps LangChain prompt templates", () => {
    const prompt = new LangChainPromptTemplate({
      template: TEMPLATE,
      inputVariables: ["name"],
    });

    const adapter = fromLangChainPromptTemplate(prompt);
    expect(adapter.template).toBe(TEMPLATE);
    expect(adapter.schema?.inputs).toEqual([{ name: "name", type: "string", required: true }]);
  });

  it("maps LlamaIndex prompt templates", () => {
    const prompt = asLlamaPromptTemplate({
      template: TEMPLATE,
      vars: () => ["name"],
      format: () => "",
      formatMessages: () => [],
    });

    const adapter = fromLlamaIndexPromptTemplate(prompt);
    expect(adapter.template).toBe(TEMPLATE);
    expect(adapter.schema?.inputs).toEqual([{ name: "name", type: "string", required: true }]);
  });
});
