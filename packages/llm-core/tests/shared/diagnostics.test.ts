import { describe, expect, it } from "bun:test";
import { createAdapterDiagnostic } from "../../src/shared/diagnostics";

describe("createAdapterDiagnostic", () => {
  it("preserves object data when adding source", () => {
    const diagnostic = createAdapterDiagnostic(
      { level: "warn", message: "test", data: { foo: "bar" } },
      "test-source",
    );
    expect(diagnostic.data).toEqual({ foo: "bar", source: "test-source" });
  });

  it("preserves primitive string data when adding source", () => {
    const diagnostic = createAdapterDiagnostic(
      { level: "warn", message: "test", data: "primitive-string" },
      "test-source",
    );
    expect(diagnostic.data).toEqual({
      data: "primitive-string",
      source: "test-source",
    });
  });

  it("preserves primitive number data when adding source", () => {
    const diagnostic = createAdapterDiagnostic(
      { level: "warn", message: "test", data: 123 },
      "test-source",
    );
    expect(diagnostic.data).toEqual({
      data: 123,
      source: "test-source",
    });
  });
});
