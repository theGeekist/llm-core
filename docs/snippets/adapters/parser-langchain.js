// #region docs
import { fromLangChainOutputParser } from "#adapters";
import { CommaSeparatedListOutputParser } from "@langchain/core/output_parsers";

// Example: Force a model to return a Javascript Array
const listParser = fromLangChainOutputParser(new CommaSeparatedListOutputParser());

// When the model returns "apple, banana, cherry"
// The parser converts it to: ["apple", "banana", "cherry"]
// #endregion docs
void listParser;
