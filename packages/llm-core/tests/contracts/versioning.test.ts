import { describe, expect, it } from "bun:test";
import {
  contractVersion,
  digest,
  isContractVersion,
  isDigest,
  isSchemaRef,
  schemaRef,
} from "../../src/contracts/versioning";

const SHA_256 = "a".repeat(64);

describe("contract versioning", () => {
  it("accepts strict SemVer contract versions", () => {
    expect(String(contractVersion("1.0.0"))).toBe("1.0.0");
    expect(String(contractVersion("2.1.0-rc.1+build.7"))).toBe("2.1.0-rc.1+build.7");
    expect(String(contractVersion("1.0.0-1a"))).toBe("1.0.0-1a");
    expect(isContractVersion("01.0.0")).toBe(false);
    expect(() => contractVersion("1.0")).toThrow();
  });

  it("accepts only canonical SHA-256 digests", () => {
    expect(digest(SHA_256)).toEqual({ algorithm: "sha-256", value: SHA_256 });
    expect(isDigest({ algorithm: "sha-256", value: SHA_256 })).toBe(true);
    expect(isDigest({ algorithm: "sha-256", value: SHA_256, credential: "secret" })).toBe(false);
    expect(isDigest({ algorithm: "sha-512", value: SHA_256 })).toBe(false);
    expect(() => digest(SHA_256.toUpperCase())).toThrow();
  });

  it("constructs storage-neutral versioned schema references", () => {
    const reference = schemaRef({
      schemaId: "https://schemas.geekist.co/llm-core/invocation",
      version: "1.0.0",
      digest: digest(SHA_256),
    });

    expect(JSON.parse(JSON.stringify(reference))).toEqual({
      schemaId: "https://schemas.geekist.co/llm-core/invocation",
      version: "1.0.0",
      digest: { algorithm: "sha-256", value: SHA_256 },
    });
    expect(isSchemaRef(reference)).toBe(true);
    expect(isSchemaRef({ ...reference, schemaId: "schemas/llm-core/invocation" })).toBe(false);
    expect(isSchemaRef({ ...reference, schemaId: "x:%%%" })).toBe(false);
    expect(isSchemaRef({ ...reference, credential: "secret" })).toBe(false);
  });
});
