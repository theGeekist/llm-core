import { describe, expect, it } from "bun:test";
import { PromptTemplate as LangChainPromptTemplate } from "@langchain/core/prompts";
import {
  fromLangChainPromptTemplate,
  fromLlamaIndexPromptTemplate,
  toPromptInputSchema,
  validatePromptInputs,
} from "#adapters";
import { asLlamaPromptTemplate } from "./helpers";

describe("Adapter prompts", () => {
  const TEMPLATE = "Hello {name}";
  const INPUT_NAME = "name";

  it("maps LangChain prompt templates", () => {
    const prompt = new LangChainPromptTemplate({
      template: TEMPLATE,
      inputVariables: [INPUT_NAME],
    });

    const adapter = fromLangChainPromptTemplate(prompt);
    expect(adapter.template).toBe(TEMPLATE);
    expect(adapter.schema?.inputs).toEqual([{ name: INPUT_NAME, type: "string", required: true }]);
  });

  it("maps LlamaIndex prompt templates", () => {
    const prompt = asLlamaPromptTemplate({
      template: TEMPLATE,
      vars: () => [INPUT_NAME],
      format: () => "",
      formatMessages: () => [],
    });

    const adapter = fromLlamaIndexPromptTemplate(prompt);
    expect(adapter.template).toBe(TEMPLATE);
    expect(adapter.schema?.inputs).toEqual([{ name: INPUT_NAME, type: "string", required: true }]);
  });

  it("exposes prompt schemas as JSON schema inputs", () => {
    const prompt = new LangChainPromptTemplate({
      template: TEMPLATE,
      inputVariables: [INPUT_NAME],
    });
    const adapter = fromLangChainPromptTemplate(prompt);
    const schema = toPromptInputSchema(adapter.schema!);
    expect(schema.kind).toBe("json-schema");
    const json = schema.jsonSchema as { properties?: Record<string, unknown> };
    expect(json.properties?.[INPUT_NAME]).toBeDefined();
  });

  it("validates prompt inputs against schema", () => {
    const prompt = new LangChainPromptTemplate({
      template: TEMPLATE,
      inputVariables: [INPUT_NAME],
    });
    const adapter = fromLangChainPromptTemplate(prompt);
    const diagnostics = validatePromptInputs(adapter.schema!, {});
    expect(diagnostics[0]?.message).toBe("prompt_input_missing");
  });
});
