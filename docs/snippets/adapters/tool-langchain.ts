// #region docs
import { fromLangChainTool } from "#adapters";
import type { Tool } from "#adapters";
import { Calculator } from "@langchain/community/tools/calculator";

// Wrap it to make it compatible with llm-core flows
const calculator: Tool = fromLangChainTool(new Calculator());
// #endregion docs

void calculator;
