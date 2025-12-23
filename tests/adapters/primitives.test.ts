import { describe, expect, it } from "bun:test";
import { createBuiltinModel, createBuiltinRetriever, createBuiltinTrace } from "#adapters";
import { assertSyncValue, captureDiagnostics, makeMessage } from "./helpers";

describe("Adapter primitives", () => {
  it("creates builtin model outputs", () => {
    const model = createBuiltinModel();
    const result = assertSyncValue(model.generate({ prompt: "hello" }));

    expect(result.text).toBe("builtin:hello");
    expect(result.diagnostics?.map((entry: { message: string }) => entry.message)).toContain(
      "usage_unavailable",
    );
  });

  it("uses the last message when building builtin model output", () => {
    const model = createBuiltinModel();
    const result = assertSyncValue(
      model.generate({
        prompt: "ignored",
        messages: [makeMessage({ content: "first" }), makeMessage({ content: "second" })],
      }),
    );

    expect(result.text).toBe("builtin:second");
  });

  it("returns structured output when schema is provided", () => {
    const model = createBuiltinModel();
    const result = assertSyncValue(
      model.generate({
        prompt: "hello",
        responseSchema: { jsonSchema: { type: "object", properties: {} }, kind: "json-schema" },
      }),
    );

    expect(result.output).toEqual({});
    expect(result.text).toBe("{}");
  });

  it("creates builtin retriever results with citations", () => {
    const retriever = createBuiltinRetriever([
      { id: "a", text: "Hello world", metadata: { source: "docs" } },
      { id: "b", text: "Other content" },
    ]);

    const result = assertSyncValue(retriever.retrieve("hello"));
    expect(result.documents[0]?.id).toBe("a");
    expect(result.citations?.[0]?.source).toBe("docs");
  });

  it("reports missing query diagnostics for builtin retriever", () => {
    const retriever = createBuiltinRetriever([{ text: "Hello world" }]);
    const { context, diagnostics } = captureDiagnostics();

    const result = assertSyncValue(retriever.retrieve("  ", context));
    expect(result.documents).toEqual([]);
    expect(diagnostics[0]?.message).toBe("retriever_query_missing");
  });

  it("records trace events", () => {
    const trace = createBuiltinTrace();
    trace.emit({ name: "run.start", timestamp: 1 });
    trace.emitMany?.([{ name: "run.end", timestamp: 2 }]);

    expect(trace.events.map((entry) => entry.name)).toEqual(["run.start", "run.end"]);
  });
});
