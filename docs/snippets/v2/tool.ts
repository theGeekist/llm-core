import { defineTool, type ToolInput } from "@geekist/llm-core";

type SearchInput = {
  query: string;
};

const searchInput: ToolInput<SearchInput> = {
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: { query: { type: "string" } },
  },
  validate: (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof value.query === "string"
      ? { valid: true }
      : { valid: false, issues: [{ path: "query", code: "required" }] },
};

const search = defineTool({
  name: "search",
  description: "Search the knowledge base.",
  input: searchInput,
  effect: "read-only",
  execute: ({ query }: SearchInput) => ({ hits: [`Result for ${query}`] }),
});

void search;
