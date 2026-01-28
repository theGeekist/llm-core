import { describe, expect, it } from "bun:test";
import type { AdapterDiagnostic } from "#adapters";
import { ModelHelper, ModelCallHelper, ModelUsageHelper } from "#adapters";
import { makeMessage } from "./helpers";

describe("Adapter modeling helpers", () => {
  it("prepares calls and prefers messages over prompt", () => {
    const prepared = ModelCallHelper.prepare({
      messages: [],
      prompt: "hi",
    });

    expect(prepared.messages).toEqual([]);
    expect(prepared.prompt).toBeUndefined();
    expect(prepared.diagnostics?.map((entry) => entry.message)).toContain(
      "prompt_ignored_when_messages_present",
    );
  });

  it("preserves prompt when messages are absent", () => {
    const prepared = ModelCallHelper.prepare({
      prompt: "hi",
    });

    expect(prepared.messages).toBeUndefined();
    expect(prepared.prompt).toBe("hi");
  });

  it("groups diagnostics by intent", () => {
    const diagnostics: AdapterDiagnostic[] = [
      { level: "warn", message: "provider_warning" },
      { level: "warn", message: "response_schema_invalid" },
      { level: "warn", message: "unknown" },
    ];

    const grouped = ModelCallHelper.groupDiagnostics(diagnostics);
    expect(grouped.provider.map((entry) => entry.message)).toEqual(["provider_warning"]);
    expect(grouped.user.map((entry) => entry.message)).toEqual(["response_schema_invalid"]);
    expect(grouped.system.map((entry) => entry.message)).toEqual(["unknown"]);
  });

  it("reports schema and tool intent", () => {
    expect(
      ModelCallHelper.shouldUseSchema({ responseSchema: { kind: "unknown", jsonSchema: {} } }),
    ).toBe(true);
    expect(
      ModelCallHelper.shouldUseTools({ tools: [{ name: "tool" }], responseSchema: undefined }),
    ).toBe(true);
  });

  it("creates adapter models from a generate function", async () => {
    const model = ModelHelper.create(() => ({ text: "ok" }));
    const result = await model.generate({ messages: [makeMessage()] });
    expect(result.text).toBe("ok");
  });

  it("warns when usage is missing", () => {
    const diagnostics: AdapterDiagnostic[] = [];
    ModelUsageHelper.warnIfMissing(diagnostics, undefined, "provider");
    expect(diagnostics.map((entry) => entry.message)).toContain("usage_unavailable");
  });
});
