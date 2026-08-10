import { selectContext } from "@geekist/llm-core/context";
import { newCoreId, type InvocationId } from "@geekist/llm-core/contracts";

const selection = selectContext({
  scope: {
    kind: "invocation",
    invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000002420"),
  },
  budget: { maxEntries: 2, maxBytes: 1_024, maxTokens: 256 },
  entries: [
    {
      source: {
        kind: "content",
        content: [{ kind: "text", text: "Receipts are authoritative." }],
      },
      provenance: { kind: "supplied", source: "application" },
      priority: "required",
      tokens: 5,
    },
  ],
});

console.log(selection.identity, selection.usage);
