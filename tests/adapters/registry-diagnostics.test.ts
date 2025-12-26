import { describe, expect, it } from "bun:test";
import type { PipelineDiagnostic } from "@wpkernel/pipeline/core";
import {
  createDefaultReporter,
  pipelineDiagnostic,
  registryDiagnostic,
} from "../../src/adapters/registry/diagnostics";
import { warnDiagnostic } from "../../src/adapters/utils";

describe("Adapter registry diagnostics", () => {
  it("creates a default reporter", () => {
    const reporter = createDefaultReporter();
    expect(typeof reporter.warn).toBe("function");
    reporter.warn?.("warn", { source: "test" });
  });

  it("wraps warning diagnostics", () => {
    const diagnostic = warnDiagnostic("registry_warn", { source: "test" });
    expect(diagnostic.level).toBe("warn");
    expect(diagnostic.message).toBe("registry_warn");
  });

  it("builds registry diagnostics with codes", () => {
    const diagnostic = registryDiagnostic("error", "registry_error", { code: "x" });
    expect(diagnostic.level).toBe("error");
    expect(diagnostic.message).toBe("registry_error");
  });

  it("wraps pipeline diagnostics", () => {
    const pipeline = {
      type: "unused-helper",
      key: "helper",
      message: "pipeline",
    } satisfies PipelineDiagnostic;
    const diagnostic = pipelineDiagnostic(pipeline);
    expect(diagnostic.message).toBe("registry_pipeline_diagnostic");
  });
});
