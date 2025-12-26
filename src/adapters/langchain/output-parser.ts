import type { BaseOutputParser } from "@langchain/core/output_parsers";
import type { OutputParser } from "../types";
import { bindFirst } from "../../maybe";

const parseWithParser = (parser: BaseOutputParser<unknown>, text: string) => parser.parse(text);

const formatWithParser = (parser: BaseOutputParser<unknown>, options?: Record<string, unknown>) =>
  parser.getFormatInstructions(options);

export const fromLangChainOutputParser = (parser: BaseOutputParser<unknown>): OutputParser => ({
  parse: bindFirst(parseWithParser, parser),
  formatInstructions: bindFirst(formatWithParser, parser),
});
