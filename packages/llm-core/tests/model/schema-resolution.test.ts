import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate as LangChainPrompt } from "@langchain/core/prompts";
import { PromptTemplate as LlamaIndexPrompt } from "@llamaindex/core/prompts";
import { contractVersion, digest, newCoreId, schemaRef, type InvocationId } from "#contracts";
import {
  fromLangChainOutputParser,
  fromLangChainPromptTemplate,
} from "../../src/adapters/frameworks/langchain/model-support/public";
import { fromLlamaIndexPromptTemplate } from "../../src/adapters/frameworks/llamaindex/model-support/public";
import { isRegisteredSchemaDocument, resolveSchemaDocument } from "../../src/features/model/public";

const DOCUMENT = { type: "object", additionalProperties: false };
const DOCUMENT_BYTES = new TextEncoder().encode(JSON.stringify(DOCUMENT));
const DIGEST = digest(createHash("sha256").update(DOCUMENT_BYTES).digest("hex"));
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
    const native = DOCUMENT_BYTES.slice();
    let receivedContext: typeof CONTEXT | undefined;
    const resolved = await resolveSchemaDocument({
      schema: REF,
      context: CONTEXT,
      resolver: {
        resolve: ({ context }) => {
          receivedContext = context;
          return { schema: REF, bytes: native };
        },
      },
    });
    native[0] = 0;
    expect(resolved.document).toEqual(DOCUMENT);
    expect(Object.keys(resolved).sort()).toEqual(["document", "schema", "verifiedDigest"]);
    expect(isRegisteredSchemaDocument(resolved)).toBe(true);
    expect(receivedContext).toEqual(CONTEXT);
    expect(Object.isFrozen(resolved.document)).toBe(true);
  });

  test("independently rejects mismatched, malformed and cyclic resolver values", async () => {
    expect(() =>
      resolveSchemaDocument({
        schema: REF,
        context: CONTEXT,
        resolver: { resolve: () => null },
      }),
    ).toThrow("exact bytes");
    expect(() =>
      resolveSchemaDocument({
        schema: REF,
        context: CONTEXT,
        resolver: {
          resolve: () => ({
            schema: REF,
            bytes: new TextEncoder().encode('{"different":true}'),
          }),
        },
      }),
    ).toThrow("SHA-256");
    const malformedUtf8 = new Uint8Array([0xff]);
    const malformedUtf8Ref = schemaRef({
      ...REF,
      digest: digest(createHash("sha256").update(malformedUtf8).digest("hex")),
    });
    expect(() =>
      resolveSchemaDocument({
        schema: malformedUtf8Ref,
        context: CONTEXT,
        resolver: {
          resolve: () => ({
            schema: malformedUtf8Ref,
            bytes: malformedUtf8,
          }),
        },
      }),
    ).toThrow("strict UTF-8 JSON");

    const malformedBytes = new TextEncoder().encode("{");
    const malformedRef = schemaRef({
      ...REF,
      digest: digest(createHash("sha256").update(malformedBytes).digest("hex")),
    });
    expect(() =>
      resolveSchemaDocument({
        schema: malformedRef,
        context: CONTEXT,
        resolver: {
          resolve: () => ({ schema: malformedRef, bytes: malformedBytes }),
        },
      }),
    ).toThrow("strict UTF-8 JSON");

    const cyclic: Record<string, unknown> = { schema: REF, bytes: DOCUMENT_BYTES };
    cyclic.self = cyclic;
    expect(() =>
      resolveSchemaDocument({
        schema: REF,
        context: CONTEXT,
        resolver: { resolve: () => cyclic as never },
      }),
    ).toThrow("exact bytes");
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
        myApiKeyValue: "placeholder",
        applicationSecretValue: "placeholder",
        userAuthorizationValue: "placeholder",
        callback: "https://signed.example.test/path",
      },
    };
    const prompt = fromLangChainPromptTemplate({ prompt: native });
    expect(prompt.inputs).toEqual([{ name: "name", type: "string", required: true }]);
    expect(prompt.metadata?.["dev.langchain"]).toEqual({
      nested: {
        myApiKeyValue: "[redacted]",
        applicationSecretValue: "[redacted]",
        userAuthorizationValue: "[redacted]",
        callback: "[redacted]",
      },
    });
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
    const native = new LlamaIndexPrompt({
      template: "Hello {name}",
      templateVars: ["name"],
      promptType: "custom",
      metadata: {
        nested: {
          myApiKeyValue: "placeholder",
          applicationSecretValue: "placeholder",
          userAuthorizationValue: "placeholder",
          skillPath: "/workspace/private",
          signedUrl: "https://placeholder.invalid/resource",
        },
      },
    });
    const prompt = fromLlamaIndexPromptTemplate({ prompt: native });
    expect(prompt.name).toBe("custom");
    expect(prompt.inputs[0]?.name).toBe("name");
    expect(prompt.metadata?.["org.llamaindex"]).toEqual({
      nested: {
        myApiKeyValue: "[redacted]",
        applicationSecretValue: "[redacted]",
        userAuthorizationValue: "[redacted]",
        skillPath: "[redacted]",
        signedUrl: "[redacted]",
      },
    });
  });
});
