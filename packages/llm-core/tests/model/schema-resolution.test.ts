import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate as LangChainPrompt } from "@langchain/core/prompts";
import type { PromptTemplate as LlamaIndexPrompt } from "@llamaindex/core/prompts";
import { contractVersion, digest, newCoreId, schemaRef, type InvocationId } from "#contracts";
import {
  fromLangChainOutputParser,
  fromLangChainPromptTemplate,
} from "../../src/adapters/frameworks/langchain/model-support/public";
import { fromLlamaIndexPromptTemplate } from "../../src/adapters/frameworks/llamaindex/model-support/public";
import { isRegisteredSchemaDocument, resolveSchemaDocument } from "../../src/features/model/public";

const DOCUMENT = { type: "object", additionalProperties: false };
const DIGEST = digest(createHash("sha256").update(JSON.stringify(DOCUMENT)).digest("hex"));
const REF = schemaRef({
  schemaId: "https://schemas.example.test/output.json",
  version: contractVersion("2.0.0"),
  digest: DIGEST,
});
const CONTEXT = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789d31"),
};

describe("trusted schema resolution", () => {
  test("registers matching strict JSON with mutation isolation", async () => {
    const native = structuredClone(DOCUMENT);
    let receivedContext: typeof CONTEXT | undefined;
    const resolved = await resolveSchemaDocument(REF, CONTEXT, {
      resolve: (_schema, context) => {
        receivedContext = context;
        return { schema: REF, document: native, verifiedDigest: DIGEST };
      },
    });
    native.type = "array";
    expect(resolved.document).toEqual(DOCUMENT);
    expect(isRegisteredSchemaDocument(resolved)).toBe(true);
    expect(receivedContext).toEqual(CONTEXT);
    expect(Object.isFrozen(resolved.document)).toBe(true);
  });

  test("rejects missing, mismatched and non-JSON native schemas", async () => {
    expect(() => resolveSchemaDocument(REF, CONTEXT, { resolve: () => null })).toThrow(
      "trusted schema identity",
    );
    expect(() =>
      resolveSchemaDocument(REF, CONTEXT, {
        resolve: () => ({
          schema: REF,
          document: DOCUMENT,
          verifiedDigest: digest("0".repeat(64)),
        }),
      }),
    ).toThrow("trusted schema identity");
    expect(() =>
      resolveSchemaDocument(REF, CONTEXT, {
        resolve: () => ({
          schema: REF,
          document: { value: Symbol("non-json") } as never,
          verifiedDigest: DIGEST,
        }),
      }),
    ).toThrow("strict JSON");
  });
});

describe("prompt and output parser adapters", () => {
  test("redacts nested native prompt metadata and freezes the projection", () => {
    const native = new LangChainPrompt({
      template: "Hello {name}",
      inputVariables: ["name"],
    });
    (native as unknown as { metadata: unknown }).metadata = {
      nested: {
        credential: "sk-secret",
        callback: "https://signed.example.test/path",
      },
    };
    const prompt = fromLangChainPromptTemplate({ prompt: native });
    expect(prompt.inputs).toEqual([{ name: "name", type: "string", required: true }]);
    expect(JSON.stringify(prompt)).not.toContain("sk-secret");
    expect(JSON.stringify(prompt)).not.toContain("signed.example");
    expect(Object.isFrozen(prompt.metadata)).toBe(true);
  });

  test("returns only closed content/json and hides malformed native errors", async () => {
    const parser = fromLangChainOutputParser(new StringOutputParser());
    await expect(parser.parse({ text: "hello" })).resolves.toEqual({
      kind: "content",
      content: [{ kind: "text", text: "hello" }],
    });
    const jsonParser = fromLangChainOutputParser({
      parse: () => Promise.resolve({ answer: "ok" }),
      getFormatInstructions: () => "json",
    } as never);
    await expect(jsonParser.parse({ text: "{}" })).resolves.toEqual({
      kind: "json",
      value: { answer: "ok" },
    });

    const malformed = fromLangChainOutputParser({
      parse: () => Promise.resolve({ execute: () => "secret" }),
      getFormatInstructions: () => "format",
    } as never);
    await expect(malformed.parse({ text: "hello" })).rejects.toThrow(
      "LangChain output parsing failed",
    );

    const throwing = fromLangChainOutputParser({
      parse: () => Promise.reject(new Error("signed https://secret.test")),
      getFormatInstructions: () => "format",
    } as never);
    await expect(throwing.parse({ text: "hello" })).rejects.not.toThrow("secret.test");
  });

  test("maps the installed LlamaIndex prompt contract without path or URL leakage", () => {
    const native = {
      template: "Hello {name}",
      vars: () => ["name"],
      promptType: "llama.prompt",
      metadata: {
        skillPath: "/Users/example/private",
        signedUrl: "https://signed.example.test",
      },
    } as unknown as LlamaIndexPrompt;
    const prompt = fromLlamaIndexPromptTemplate({ prompt: native });
    expect(prompt.name).toBe("llama.prompt");
    expect(prompt.inputs[0]?.name).toBe("name");
    expect(JSON.stringify(prompt)).not.toContain("signed.example");
    expect(JSON.stringify(prompt)).not.toContain("/Users/example");
  });
});
