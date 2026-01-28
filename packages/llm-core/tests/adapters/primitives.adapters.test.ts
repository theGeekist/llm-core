import { describe, expect, it } from "bun:test";
import { createBuiltinAdapters } from "../../src/adapters/primitives/adapters";
import { createMockModel, createMockRetriever } from "../fixtures/factories";

const createEventStream = () => ({
  emit: () => true,
});

describe("adapter builtin adapters", () => {
  it("uses explicit retriever when provided", () => {
    const model = createMockModel("hi");
    const retriever = createMockRetriever([{ text: "doc" }]);

    const adapters = createBuiltinAdapters({ model, retriever });

    expect(adapters.model).toBe(model);
    expect(adapters.retriever).toBe(retriever);
  });

  it("creates retriever from documents when retriever is missing", () => {
    const adapters = createBuiltinAdapters({ documents: [{ text: "doc" }] });

    expect(adapters.retriever).not.toBeUndefined();
  });

  it("includes event stream and trace when provided", () => {
    const eventStream = createEventStream();
    const trace = createEventStream();

    const adapters = createBuiltinAdapters({ eventStream, trace });

    expect(adapters.eventStream).toBe(eventStream);
    expect(adapters.trace).toBe(trace);
  });
});
