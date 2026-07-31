import type { BaseOutputParser } from "@langchain/core/output_parsers";
import { isJsonValue } from "#contracts";
import type { ModelOutputParser, ParsedModelOutput } from "../../../../features/model/public";
import { createParsedModelOutput } from "../../../../features/model/runtime";

const projectNativeOutput = (value: unknown): ParsedModelOutput => {
  if (typeof value === "string") {
    return createParsedModelOutput({
      kind: "content",
      content: [{ kind: "text", text: value }],
    });
  }
  if (isJsonValue(value)) {
    return createParsedModelOutput({ kind: "json", value });
  }
  throw new TypeError("LangChain parser returned non-portable output.");
};

export const fromLangChainOutputParser = (
  parser: BaseOutputParser<unknown>,
): ModelOutputParser => ({
  async parse({ text }) {
    if (typeof text !== "string") {
      throw new TypeError("Output parsing requires text.");
    }
    try {
      return projectNativeOutput(await parser.parse(text));
    } catch {
      throw new TypeError("LangChain output parsing failed.");
    }
  },
  async formatInstructions() {
    try {
      const instructions = await parser.getFormatInstructions();
      if (typeof instructions !== "string") {
        throw new TypeError();
      }
      return instructions;
    } catch {
      throw new TypeError("LangChain format instructions failed.");
    }
  },
});
