import { describe, expect, it } from "bun:test";
import { StructuredQuery as LangChainStructuredQuery } from "@langchain/core/structured_query";
import type { FilterDirective } from "@langchain/core/structured_query";
import { fromLangChainStructuredQuery } from "#adapters";

const asFilterDirective = (value: Record<string, unknown>): FilterDirective =>
  value as unknown as FilterDirective;

const buildQuery = (filter?: FilterDirective) => new LangChainStructuredQuery("query", filter);

describe("Adapter structured query", () => {
  it("maps comparison-like filters with non-primitive values to empty strings", () => {
    const filter = asFilterDirective({ comparator: "eq", attribute: "status", value: {} });
    const adapted = fromLangChainStructuredQuery(buildQuery(filter));
    expect(adapted.filter).toEqual({
      type: "comparison",
      comparator: "eq",
      attribute: "status",
      value: "",
    });
  });

  it("maps operation-like filters and drops empty args", () => {
    const filter = asFilterDirective({ operator: "and", args: [] });
    const adapted = fromLangChainStructuredQuery(buildQuery(filter));
    expect(adapted.filter).toEqual({
      type: "operation",
      operator: "and",
      args: null,
    });
  });

  it("maps operation-like filters with comparison-like args", () => {
    const filter = asFilterDirective({
      operator: "and",
      args: [{ comparator: "gt", attribute: "score", value: 2 }],
    });
    const adapted = fromLangChainStructuredQuery(buildQuery(filter));
    expect(adapted.filter).toEqual({
      type: "operation",
      operator: "and",
      args: [
        {
          type: "comparison",
          comparator: "gt",
          attribute: "score",
          value: 2,
        },
      ],
    });
  });

  it("drops unknown filter directives", () => {
    const filter = asFilterDirective({ foo: "bar" });
    const adapted = fromLangChainStructuredQuery(buildQuery(filter));
    expect(adapted.filter).toBeNull();
  });
});
