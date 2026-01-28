import { describe, expect, it } from "bun:test";
import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { BaseRetriever as LlamaRetriever } from "@llamaindex/core/retriever";
import {
  Document as LlamaDocument,
  MetadataMode,
  type BaseNode,
  type NodeWithScore,
} from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { Retriever } from "#workflow";
import { maybeMap } from "#shared/maybe";

const toRetrieverFromLangChain = (retriever: BaseRetrieverInterface): Retriever => ({
  retrieve: (query) =>
    maybeMap(
      (docs) => ({
        query,
        documents: docs.map((doc) => ({
          id: doc.id,
          text: doc.pageContent,
          metadata: doc.metadata,
        })),
      }),
      retriever.invoke(String(query)),
    ),
});

const toRetrieverFromLlama = (retriever: LlamaRetriever): Retriever => ({
  retrieve: (query) =>
    maybeMap(
      (nodes) => ({
        query,
        documents: nodes.map((entry) => ({
          id: entry.node.id_,
          text: getLlamaNodeText(entry.node),
          metadata: entry.node.metadata,
          score: entry.score,
        })),
      }),
      retriever.retrieve(String(query)),
    ),
});

const getLlamaNodeText = (node: BaseNode): string => {
  if ("getText" in node && typeof node.getText === "function") {
    return node.getText();
  }
  return node.getContent(MetadataMode.NONE);
};

describe("Interop retriever", () => {
  it("maps LangChain retriever to Retriever", async () => {
    const retriever = {
      invoke: () =>
        Promise.resolve([
          new LangChainDocument({ pageContent: "hello", metadata: { source: "lc" } }),
        ]),
    } as unknown as BaseRetrieverInterface;

    const adapted = toRetrieverFromLangChain(retriever);
    const result = await adapted.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex retriever to Retriever", async () => {
    const node = new LlamaDocument({ text: "hello", metadata: { source: "llama" } });
    const nodes: NodeWithScore[] = [{ node, score: 0.9 }];
    const retriever = {
      retrieve: () => Promise.resolve(nodes),
    } as unknown as LlamaRetriever;

    const adapted = toRetrieverFromLlama(retriever);
    const result = await adapted.retrieve("query");
    expect(result.documents[0]?.text).toBe("hello");
  });

  it("notes AI SDK has no retriever abstraction", () => {
    expect("BaseRetriever" in AiSdk).toBe(false);
  });
});
