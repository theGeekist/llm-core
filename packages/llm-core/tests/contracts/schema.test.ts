import { describe, expect, test } from "bun:test";
import { coreId, type EvidenceId, type ResourceId } from "../../src/contracts/identity";
import type { JsonValue } from "../../src/contracts/extensions";
import type { EvidenceRef, PortableContent, ResourceRef } from "../../src/contracts/schema";
import { contractVersion, digest, type SchemaRef } from "../../src/contracts/versioning";
import {
  CONTRACT_SCHEMA_DRAFT,
  CONTRACT_SCHEMA_ID,
  normalizeGeneratedSchema,
  serializeGeneratedSchema,
  sha256Hex,
} from "../../scripts/generate-contract-schemas";

describe("portable schema contracts", () => {
  test("SchemaRef round-trips as JSON", () => {
    const reference: SchemaRef = {
      schemaId: "https://llm-core.geekist.co/schemas/invocation/v1",
      version: contractVersion("1.2.3-beta.1+build.7"),
      digest: digest("a".repeat(64)),
    };

    expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
  });

  test("JsonValue accepts nested JSON extension data", () => {
    const value: JsonValue = {
      "com.example.runtime": {
        enabled: true,
        attempts: 2,
        labels: ["alpha", null],
      },
    };

    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  test("portable content covers text, JSON, binary, and resource references", () => {
    const resource: ResourceRef = {
      resourceId: coreId<ResourceId>("018f0c7a-4d2b-7abc-8def-0123456789ab"),
      mediaType: "image/png",
      byteLength: 3,
      digest: digest("b".repeat(64)),
    };
    const content: PortableContent[] = [
      { kind: "text", text: "hello" },
      { kind: "json", value: { accepted: true } },
      {
        kind: "binary",
        mediaType: "application/octet-stream",
        encoding: "base64",
        data: "AQID",
        byteLength: 3,
        digest: digest("b".repeat(64)),
      },
      { kind: "media-ref", mediaType: "image/png", resource, altText: "preview" },
    ];

    expect(JSON.parse(JSON.stringify(content))).toEqual(content);
  });

  test("evidence references contain no physical locator", () => {
    const evidence: EvidenceRef = {
      evidenceId: coreId<EvidenceId>("018f0c7a-4d2b-7abc-8def-0123456789ab"),
      kind: "execution-receipt",
      content: {
        resourceId: coreId<ResourceId>("018f0c7a-4d2b-7abc-8def-1123456789ab"),
        mediaType: "application/json",
        byteLength: 42,
        digest: digest("c".repeat(64)),
      },
    };
    const serialized = JSON.stringify(evidence);

    expect(JSON.parse(serialized)).toEqual(evidence);
    expect(serialized).not.toContain("path");
    expect(serialized).not.toContain("url");
    expect(serialized).not.toContain("bucket");
  });
});

describe("contract schema projection", () => {
  test("normalizes to a stable Draft 7 document", () => {
    const normalized = normalizeGeneratedSchema({
      definitions: {
        Example: {
          properties: {
            zeta: { type: "string" },
            alpha: { type: "boolean" },
          },
          type: "object",
        },
      },
      $schema: "unexpected",
      $id: "unexpected",
    });

    expect(normalized.$schema).toBe(CONTRACT_SCHEMA_DRAFT);
    expect(normalized.$id).toBe(CONTRACT_SCHEMA_ID);
    expect(Object.keys(normalized)).toEqual(["$id", "$schema", "definitions"]);
    expect(
      Object.keys(
        ((normalized.definitions as Record<string, JsonValue>).Example as Record<string, JsonValue>)
          .properties as Record<string, JsonValue>,
      ),
    ).toEqual(["alpha", "zeta"]);
  });

  test("serialization is deterministic and newline-terminated", () => {
    const left = serializeGeneratedSchema({
      definitions: { B: { type: "string" }, A: { type: "number" } },
    });
    const right = serializeGeneratedSchema({
      definitions: { A: { type: "number" }, B: { type: "string" } },
    });

    expect(left).toBe(right);
    expect(left.endsWith("\n")).toBe(true);
  });

  test("preserves Draft 7 constraints that accompany a reference", () => {
    const normalized = normalizeGeneratedSchema({
      definitions: {
        BrandedId: {
          $ref: "#/definitions/StringValue",
          pattern: "^[a-z]+$",
        },
        StringValue: { type: "string" },
      },
    });
    const definitions = normalized.definitions as Record<string, JsonValue>;

    expect(definitions.BrandedId).toEqual({
      allOf: [{ $ref: "#/definitions/StringValue" }],
      pattern: "^[a-z]+$",
      type: "string",
    });
  });

  test("enforces reverse-DNS keys for native extensions", () => {
    const normalized = normalizeGeneratedSchema({
      definitions: {
        NativeExtensions: {
          additionalProperties: { type: "string" },
          type: "object",
        },
      },
    });
    const definitions = normalized.definitions as Record<string, JsonValue>;

    expect(definitions.NativeExtensions).toEqual({
      additionalProperties: { type: "string" },
      propertyNames: {
        pattern:
          "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
      },
      type: "object",
    });
  });

  test("digest covers the exact serialized bytes", () => {
    const bytes = serializeGeneratedSchema({ definitions: {} });

    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(`${bytes}\n`)).not.toBe(sha256Hex(bytes));
  });
});
