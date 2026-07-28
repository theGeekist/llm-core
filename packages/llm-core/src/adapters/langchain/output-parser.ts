import type { BaseOutputParser } from "@langchain/core/output_parsers";
import type { OutputParser } from "../types";

export const fromLangChainOutputParser = (parser: BaseOutputParser<unknown>): OutputParser => ({
  parse: ({ text }) => parser.parse(text),
  formatInstructions: () => parser.getFormatInstructions(),
});
