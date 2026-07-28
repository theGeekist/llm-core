import { describe, expect, it } from "bun:test";
import {
  createAdapterDiagnostic,
  createContractDiagnostic,
  createLifecycleDiagnostic,
  createRecipeDiagnostic,
  createRequirementDiagnostic,
  createResumeDiagnostic,
} from "../../src/shared/diagnostics";
import type { DiagnosticKind } from "../../src/shared/reporting";

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

describe("warning diagnostic factories", () => {
  it("preserves each public factory's diagnostic kind", () => {
    const data = { source: "test" };
    const factories: Array<[(message: string, data?: unknown) => unknown, DiagnosticKind]> = [
      [createLifecycleDiagnostic, "pipeline"],
      [createResumeDiagnostic, "resume"],
      [createRequirementDiagnostic, "requirement"],
      [createContractDiagnostic, "contract"],
      [createRecipeDiagnostic, "recipe"],
    ];

    for (const [createDiagnostic, kind] of factories) {
      expect(createDiagnostic("message", data)).toEqual({
        level: "warn",
        kind,
        message: "message",
        data,
      });
    }
  });
});
