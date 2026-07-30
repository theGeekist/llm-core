import { describe, expect, test } from "bun:test";
import { newCoreId, type InvocationContext, type InvocationId } from "#contracts";
import type {
  DocumentLoader,
  QueryEngine,
  RetrievalQuery,
  Retriever,
  StructuredQuery,
  TextSplitter,
} from "../../src/features/retrieval/public";
import {
  documentText,
  retrievalQueryText,
  textDocument,
  textRetrievalQuery,
} from "../../src/features/retrieval/public";

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("0190bd0c-0000-7000-8000-000000001410"),
};

describe("retrieval feature front", () => {
  test("represents document content without physical storage locators", () => {
    const document = textDocument("hello", {
      id: "doc-1",
      metadata: { source: "portable" },
    });

    expect(documentText(document)).toBe("hello");
    expect(document).toEqual({
      id: "doc-1",
      content: [{ kind: "text", text: "hello" }],
      metadata: { source: "portable" },
    });
    expect("path" in document).toBe(false);
    expect("url" in document).toBe(false);
  });

  test("extracts deterministic text from the closed portable content union", () => {
    const query: RetrievalQuery = {
      content: [
        { kind: "text", text: "find " },
        { kind: "json", value: { topic: "ports" } },
        {
          kind: "media-ref",
          mediaType: "image/png",
          altText: "diagram",
          resource: {
            resourceId: "0190bd0c-0000-7000-8000-000000001411" as never,
            mediaType: "image/png",
            byteLength: 1,
            digest: { algorithm: "sha-256", value: "0".repeat(64) as never },
          },
        },
      ],
    };

    expect(retrievalQueryText(query)).toBe('find {"topic":"ports"}diagram');
  });

  test("fails closed when a text-only projection would discard portable content", () => {
    const resource = {
      resourceId: "0190bd0c-0000-7000-8000-000000001411" as never,
      mediaType: "image/png",
      byteLength: 1,
      digest: { algorithm: "sha-256" as const, value: "0".repeat(64) as never },
    };

    expect(() =>
      documentText({
        content: [{ kind: "media-ref", mediaType: "image/png", resource }],
      }),
    ).toThrow("without semantic loss");
    expect(() =>
      retrievalQueryText({
        content: [
          {
            kind: "binary",
            mediaType: "application/octet-stream",
            encoding: "base64",
            data: "AA==" as never,
            byteLength: 1,
            digest: { algorithm: "sha-256", value: "0".repeat(64) as never },
          },
        ],
      }),
    ).toThrow("without semantic loss");
  });

  test("passes InvocationContext separately through sync and async ports", async () => {
    const seen: InvocationContext[] = [];
    const loader: DocumentLoader = {
      load: ({ context: invocation }) => {
        seen.push(invocation);
        return [textDocument("loaded")];
      },
    };
    const retriever: Retriever = {
      retrieve: async ({ request: { query }, context: invocation }) => {
        seen.push(invocation);
        return { query, documents: await loader.load({ context: invocation }) };
      },
    };

    const result = await retriever.retrieve({
      request: { query: textRetrievalQuery("q") },
      context: context,
    });
    expect(result.documents.map(documentText)).toEqual(["loaded"]);
    expect(seen).toEqual([context, context]);
    expect("context" in result).toBe(false);
  });

  test("preserves optional batch and stream behavior on capability ports", async () => {
    const splitter: TextSplitter = {
      split: ({ request: { text } }) => text.split(" "),
      splitBatch: ({ request: { texts } }) => Promise.resolve(texts.map((text) => text.split(" "))),
    };
    const queryEngine: QueryEngine = {
      query: ({ request: { query } }) => ({
        query,
        content: [{ kind: "text", text: "answer" }],
      }),
      stream: ({ request: { query } }) =>
        Promise.resolve([
          { kind: "start" as const },
          {
            kind: "end" as const,
            result: { query, content: [{ kind: "text" as const, text: "answer" }] },
          },
        ]),
    };

    expect(
      await splitter.splitBatch?.({ request: { texts: ["a b", "c d"] }, context: context }),
    ).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(
      queryEngine.stream?.({ request: { query: textRetrievalQuery("q") }, context: context }),
    ).toBeInstanceOf(Promise);
  });

  test("uses closed discriminants for structured filters", () => {
    const query: StructuredQuery = {
      query: "documents",
      filter: {
        kind: "operation",
        operator: "and",
        filters: [
          { kind: "comparison", comparator: "eq", attribute: "status", value: "published" },
        ],
      },
    };
    expect(query.filter?.kind).toBe("operation");
  });
});
