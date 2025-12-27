import { describe, expect, it } from "bun:test";
import type { BaseQueryEngine, QueryType } from "@llamaindex/core/query-engine";
import { Document, EngineResponse } from "@llamaindex/core/schema";
import { fromLlamaIndexQueryEngine } from "#adapters";

const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value;
    }
  },
});

const createQueryEngine = (
  response: EngineResponse,
  stream: AsyncIterable<EngineResponse>,
): BaseQueryEngine =>
  ({
    query: async (params: { query: QueryType; stream?: boolean }) =>
      params.stream ? stream : response,
  }) as unknown as BaseQueryEngine;

describe("Adapter LlamaIndex query engine", () => {
  it("maps query responses into adapter results", async () => {
    const node = new Document({ text: "source" });
    const response = EngineResponse.fromResponse("ok", false, [{ node, score: 0.7 }]);
    const engine = createQueryEngine(response, asAsyncIterable([]));

    const adapter = fromLlamaIndexQueryEngine(engine);
    const result = await adapter.query("hello");
    expect(result.text).toBe("ok");
    expect(result.sources?.[0]?.text).toBe("source");
  });

  it("streams delta events for query responses", async () => {
    const node = new Document({ text: "source" });
    const response = EngineResponse.fromResponse("hi", true, [{ node, score: 0.2 }]);
    const engine = createQueryEngine(response, asAsyncIterable([response]));
    const adapter = fromLlamaIndexQueryEngine(engine);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const events: Array<{ type: string; text?: string }> = [];
    const stream = await adapter.stream("hi");
    for await (const event of stream) {
      events.push({ type: event.type, text: "text" in event ? event.text : undefined });
    }
    expect(events[0]?.type).toBe("start");
    expect(events[1]?.type).toBe("delta");
    expect(events[1]?.text).toBe("hi");
    expect(events.at(-1)?.type).toBe("end");
  });

  it("adds diagnostics to stream end events when query is missing", async () => {
    const response = EngineResponse.fromResponse("ok", false, []);
    const engine = createQueryEngine(response, asAsyncIterable([]));
    const adapter = fromLlamaIndexQueryEngine(engine);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const events: Array<{ type: string; diagnostics?: Array<{ message: string }> }> = [];
    const stream = await adapter.stream(" ");
    for await (const event of stream) {
      events.push({
        type: event.type,
        diagnostics: "diagnostics" in event ? event.diagnostics : undefined,
      });
    }
    const end = events.at(-1);
    expect(end?.type).toBe("end");
    expect(end?.diagnostics?.map((entry) => entry.message)).toContain("query_engine_query_missing");
  });
});
