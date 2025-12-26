import { describe, expect, it } from "bun:test";
import {
  Comparison,
  Operation,
  StructuredQuery as LangChainStructuredQuery,
} from "@langchain/core/structured_query";
import * as AiSdk from "ai";
import * as LlamaIndexLLM from "@llamaindex/core/llms";
import { fromLangChainStructuredQuery } from "#adapters";

describe("Interop structured query", () => {
  it("maps LangChain structured query to StructuredQuery", () => {
    const filter = new Operation("and", [
      new Comparison("eq", "type", "blog"),
      new Comparison("gt", "score", 10),
    ]);
    const query = new LangChainStructuredQuery("find docs", filter);
    const adapted = fromLangChainStructuredQuery(query);

    expect(adapted).toEqual({
      query: "find docs",
      filter: {
        type: "operation",
        operator: "and",
        args: [
          { type: "comparison", comparator: "eq", attribute: "type", value: "blog" },
          { type: "comparison", comparator: "gt", attribute: "score", value: 10 },
        ],
      },
    });
  });

  it("notes AI SDK has no structured query abstraction", () => {
    expect("StructuredQuery" in AiSdk).toBe(false);
  });

  it("notes LlamaIndex has no structured query abstraction", () => {
    expect("StructuredQuery" in LlamaIndexLLM).toBe(false);
  });
});
