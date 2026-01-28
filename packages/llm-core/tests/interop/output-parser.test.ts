import { describe, expect, it } from "bun:test";
import { StringOutputParser } from "@langchain/core/output_parsers";
import * as AiSdk from "ai";
import * as LlamaIndexLLM from "@llamaindex/core/llms";
import type { OutputParser } from "#adapters";

const toOutputParserFromLangChain = (parser: StringOutputParser): OutputParser => ({
  parse: (text) => parser.parse(text),
  formatInstructions: () => parser.getFormatInstructions(),
});

describe("Interop output parser", () => {
  it("maps LangChain output parser to OutputParser", async () => {
    const parser = new StringOutputParser();
    const adapted = toOutputParserFromLangChain(parser);
    const result = await adapted.parse("hello");
    expect(result).toBe("hello");
    expect(typeof adapted.formatInstructions?.()).toBe("string");
  });

  it("notes AI SDK has no output parser abstraction", () => {
    expect("OutputParser" in AiSdk).toBe(false);
  });

  it("notes LlamaIndex has no output parser abstraction", () => {
    expect("OutputParser" in LlamaIndexLLM).toBe(false);
  });
});
