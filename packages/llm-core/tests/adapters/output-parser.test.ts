import { describe, expect, it } from "bun:test";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { fromLangChainOutputParser } from "#adapters";

describe("Adapter output parser", () => {
  it("maps LangChain output parser parse and format instructions", async () => {
    const parser = new StringOutputParser();
    const adapted = fromLangChainOutputParser(parser);
    const result = await adapted.parse("hello");
    expect(result).toBe("hello");
    expect(typeof adapted.formatInstructions?.()).toBe("string");
  });
});
