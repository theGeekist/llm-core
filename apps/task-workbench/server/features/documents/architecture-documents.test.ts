import { describe, expect, test } from "bun:test";
import { readArchitectureDocument } from "./architecture-documents";

describe("architecture documents", () => {
  test("rejects files outside architecture task and decision authorities", () => {
    expect(() => readArchitectureDocument("package.json")).toThrow(
      "Document path is outside architecture authority",
    );
    expect(() =>
      readArchitectureDocument(
        "packages/llm-core/docs/final-architecture/decisions/../../../../../package.json",
      ),
    ).toThrow("Document path is outside architecture authority");
  });
});
