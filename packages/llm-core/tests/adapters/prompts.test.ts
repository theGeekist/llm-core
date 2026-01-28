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

  it("flags invalid prompt input types", () => {
    const prompt = fromLangChainPromptTemplate(
      new LangChainPromptTemplate({
        template: TEMPLATE,
        inputVariables: [INPUT_NAME],
      }),
    );
    prompt.schema = {
      name: "test",
      inputs: [
        { name: "flag", type: "boolean", required: true },
        { name: "count", type: "integer" },
        { name: "tags", type: "array" },
        { name: "meta", type: "object" },
      ],
    };

    const diagnostics = validatePromptInputs(prompt.schema, {
      flag: "nope",
      count: 1.5,
      tags: "tag",
      meta: "data",
    });

    expect(diagnostics.map((entry) => entry.message)).toContain("prompt_input_invalid_type");
  });

  it("accepts valid prompt inputs without diagnostics", () => {
    const schema = {
      name: "test",
      inputs: [
        { name: "flag", type: "boolean", required: true },
        { name: "count", type: "integer", required: true },
        { name: "tags", type: "array" },
        { name: "meta", type: "object" },
      ],
    };

    const diagnostics = validatePromptInputs(schema, {
      flag: true,
      count: 2,
      tags: ["a"],
      meta: { ok: true },
    });

    expect(diagnostics).toHaveLength(0);
  });
});
