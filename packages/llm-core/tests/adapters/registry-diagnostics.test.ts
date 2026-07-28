import { describe, expect, it } from "bun:test";
import { registryDiagnostic } from "../../src/adapters/registry/diagnostics";
import { warnDiagnostic } from "../../src/adapters/utils";

describe("Adapter registry diagnostics", () => {
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
});
