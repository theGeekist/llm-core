import { describe, expect, it } from "bun:test";
import type { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { EngineResponse } from "@llamaindex/core/schema";
import {
  collectStep,
  fromLlamaIndexResponseSynthesizer,
  isPromiseLike,
  maybeToStep,
} from "#adapters";
import { captureDiagnostics } from "./helpers";

const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value;
    }
  },
});

const createSynthesizer = (
  response: EngineResponse,
  stream: AsyncIterable<EngineResponse>,
): BaseSynthesizer =>
  ({
    synthesize: async (_input: unknown, isStream?: boolean) => (isStream ? stream : response),
  }) as unknown as BaseSynthesizer;

describe("Adapter LlamaIndex response synthesizer", () => {
  it("uses fallback sources when response nodes are missing", async () => {
    const response = EngineResponse.fromResponse("ok", false, []);
    const synthesizer = createSynthesizer(response, asAsyncIterable([]));
    const adapter = fromLlamaIndexResponseSynthesizer(synthesizer);

    const result = await adapter.synthesize({
      query: "q",
      documents: [{ text: "doc" }],
    });

    expect(result.text).toBe("ok");
    expect(result.sources?.[0]?.text).toBe("doc");
  });

  it("streams delta events for synthesized responses", async () => {
    const response = EngineResponse.fromResponse("hi", true, []);
    const synthesizer = createSynthesizer(response, asAsyncIterable([response]));
    const adapter = fromLlamaIndexResponseSynthesizer(synthesizer);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const stream = await adapter.stream({
      query: "q",
      documents: [{ text: "doc" }],
    });
    const events: string[] = [];
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    for (const event of items) {
      events.push(event.type);
    }
    expect(events[0]).toBe("start");
    expect(events.at(-1)).toBe("end");
  });

  it("adds diagnostics to stream end events when inputs are missing", async () => {
    const response = EngineResponse.fromResponse("ok", false, []);
    const synthesizer = createSynthesizer(response, asAsyncIterable([]));
    const adapter = fromLlamaIndexResponseSynthesizer(synthesizer);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const stream = await adapter.stream({ query: " ", documents: [] });
    const events: Array<{ type: string; diagnostics?: Array<{ message: string }> }> = [];
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    for (const event of items) {
      events.push({
        type: event.type,
        diagnostics: "diagnostics" in event ? event.diagnostics : undefined,
      });
    }
    const end = events.at(-1);
    expect(end?.type).toBe("end");
    expect(end?.diagnostics?.map((entry) => entry.message)).toContain(
      "response_synthesizer_query_missing",
    );
    expect(end?.diagnostics?.map((entry) => entry.message)).toContain(
      "response_synthesizer_documents_missing",
    );
  });

  it("returns diagnostics when inputs are missing", async () => {
    const response = EngineResponse.fromResponse("ok", false, []);
    const synthesizer = createSynthesizer(response, asAsyncIterable([]));
    const adapter = fromLlamaIndexResponseSynthesizer(synthesizer);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.synthesize({ query: " ", documents: [] }, context);

    expect(result.text).toBe("");
    expect(result.diagnostics?.map((entry) => entry.message)).toContain(
      "response_synthesizer_query_missing",
    );
    expect(diagnostics.map((entry) => entry.message)).toContain(
      "response_synthesizer_query_missing",
    );
  });
});
