import { describe, expect, it } from "bun:test";
import type { BaseDocumentTransformer } from "@langchain/core/documents";
import { Document as LangChainDocument } from "@langchain/core/documents";
import type { NodeParser } from "@llamaindex/core/node-parser";
import { Document as LlamaDocument } from "@llamaindex/core/schema";
import * as AiSdk from "ai";
import type { DocumentTransformer } from "#workflow";
import { maybeMap } from "./helpers";

const toAdapterTransformerFromLangChain = (
  transformer: BaseDocumentTransformer,
): DocumentTransformer => ({
  transform: (documents) => {
    const langchainDocs = documents.map(
      (doc) =>
        new LangChainDocument({
          pageContent: doc.text,
          metadata: doc.metadata,
          id: doc.id,
        }),
    );
    return maybeMap(
      (result) =>
        result.map((doc) => ({
          id: doc.id,
          text: doc.pageContent,
          metadata: doc.metadata,
        })),
      transformer.transformDocuments(langchainDocs),
    );
  },
});

const toAdapterTransformerFromLlama = (parser: NodeParser): DocumentTransformer => ({
  transform: (documents) => {
    const llamaDocs = documents.map(
      (doc) => new LlamaDocument({ text: doc.text, metadata: doc.metadata }),
    );
    return maybeMap(
      (nodes) =>
        nodes.map((node) => ({
          id: node.id_,
          text: node.text ?? "",
          metadata: node.metadata,
        })),
      parser.getNodesFromDocuments(llamaDocs),
    );
  },
});

describe("Interop transformer", () => {
  it("maps LangChain transformer to DocumentTransformer", async () => {
    const transformer = {
      transformDocuments: (docs: LangChainDocument[]) => Promise.resolve(docs),
    } as BaseDocumentTransformer;

    const adapted = toAdapterTransformerFromLangChain(transformer);
    const result = await adapted.transform([{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("maps LlamaIndex node parser to DocumentTransformer", async () => {
    const parser = {
      getNodesFromDocuments: (docs: LlamaDocument[]) => Promise.resolve(docs),
    } as unknown as NodeParser;

    const adapted = toAdapterTransformerFromLlama(parser);
    const result = await adapted.transform([{ text: "hello" }]);
    expect(result[0]?.text).toBe("hello");
  });

  it("notes AI SDK has no transformer abstraction", () => {
    expect("BaseDocumentTransformer" in AiSdk).toBe(false);
  });
});
