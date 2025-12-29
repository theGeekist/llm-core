import {
  Comparison,
  StructuredQuery as LangChainStructuredQuery,
} from "@langchain/core/structured_query";
import { fromLangChainStructuredQuery } from "#adapters";

const lcQuery = new LangChainStructuredQuery(
  "find docs",
  new Comparison("eq", "category", "policies"),
);

const query = fromLangChainStructuredQuery(lcQuery);

void query;
