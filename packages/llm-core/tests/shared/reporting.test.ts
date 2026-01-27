import { describe, expect, it } from "bun:test";
import {
  addDiagnostic,
  addTrace,
  applyDiagnosticsMode,
  applyDiagnosticsModeToTraceDiagnostics,
  createTraceDiagnostics,
  type DiagnosticEntry,
  type TraceDiagnostics,
} from "../../src/shared/reporting";

describe("reporting", () => {
  describe("createTraceDiagnostics", () => {
    it("creates an empty trace diagnostics object", () => {
      const result = createTraceDiagnostics();
      expect(result.trace).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("addTrace", () => {
    it("adds a trace event with timestamp", () => {
      const target = createTraceDiagnostics();
      addTrace(target, "test-event", { value: 1 });
      expect(target.trace.length).toBe(1);
      expect(target.trace[0]?.kind).toBe("test-event");
      expect(target.trace[0]?.data).toEqual({ value: 1 });
      // Validate ISO 8601 format
      const timestamp = target.trace[0]?.at;
      expect(timestamp).toBeString();
      expect(timestamp?.endsWith("Z")).toBe(true);
      expect(Date.parse(timestamp as string)).not.toBeNaN();
    });
  });

  describe("addDiagnostic", () => {
    it("adds a diagnostic entry", () => {
      const target = createTraceDiagnostics();
      const entry: DiagnosticEntry = {
        level: "warn",
        kind: "pipeline",
        message: "something happened",
      };
      addDiagnostic(target, entry);
      expect(target.diagnostics.length).toBe(1);
      expect(target.diagnostics[0]).toEqual(entry);
    });
  });

  describe("applyDiagnosticsMode", () => {
    const entries: DiagnosticEntry[] = [
      { level: "warn", kind: "pipeline", message: "warn 1" },
      { level: "warn", kind: "requirement", message: "warn 2" },
      { level: "warn", kind: "contract", message: "warn 3" },
      { level: "warn", kind: "recipe", message: "warn 4" },
      { level: "error", kind: "adapter", message: "error 1" },
    ];

    it("returns original diagnostics in default mode", () => {
      const result = applyDiagnosticsMode(entries, "default");
      expect(result).toEqual(entries);
    });

    it("promotes specific warnings to errors in strict mode", () => {
      const result = applyDiagnosticsMode(entries, "strict");
      expect(result).toHaveLength(5);

      // pipeline - stays same
      expect(result[0]?.level).toBe("warn");

      // requirement - promotes
      expect(result[1]?.level).toBe("error");

      // contract - promotes
      expect(result[2]?.level).toBe("error");

      // recipe - promotes
      expect(result[3]?.level).toBe("error");

      // adapter - stays same (already error)
      expect(result[4]?.level).toBe("error");
    });
  });

  describe("applyDiagnosticsModeToTraceDiagnostics", () => {
    it("applies strict mode to nested diagnostics", () => {
      const td: TraceDiagnostics = {
        trace: [],
        diagnostics: [{ level: "warn", kind: "requirement", message: "test" }],
      };
      const result = applyDiagnosticsModeToTraceDiagnostics(td, "strict");
      expect(result.diagnostics[0]?.level).toBe("error");
    });

    it("keeps existing trace data", () => {
      const td: TraceDiagnostics = {
        trace: [{ kind: "foo", at: "now" }],
        diagnostics: [],
      };
      const result = applyDiagnosticsModeToTraceDiagnostics(td, "strict");
      expect(result.trace).toEqual(td.trace);
    });
  });
});
