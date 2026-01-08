// #region docs
import { createInteractionSession, type SessionId, type InteractionState } from "#interaction";
import { createBuiltinModel, type EventStream, type EventStreamEvent } from "#adapters";

type SseWriter = {
  write: (chunk: string) => Promise<void> | void;
  close?: () => Promise<void> | void;
};

class MemorySessionStore {
  private cache = new Map<string, InteractionState>();

  load(sessionId: SessionId) {
    return this.cache.get(toSessionKey(sessionId)) ?? null;
  }

  save(sessionId: SessionId, state: InteractionState) {
    this.cache.set(toSessionKey(sessionId), state);
    return true;
  }
}

class EdgeSseEventStream implements EventStream {
  private writer: SseWriter;

  constructor(options: { writer: SseWriter }) {
    this.writer = options.writer;
  }

  emit(event: EventStreamEvent) {
    return writeSseChunk({ writer: this.writer, chunk: formatSseEvent(event) });
  }

  emitMany(events: EventStreamEvent[]) {
    const chunks: string[] = [];
    for (const event of events) {
      chunks.push(formatSseEvent(event));
    }
    return writeSseChunks({ writer: this.writer, chunks });
  }
}

export const createEdgeSseEventStream = (options: { writer: SseWriter }) =>
  new EdgeSseEventStream(options);

const store = new MemorySessionStore();

export const handleEdgeRequest = (input: {
  writer: SseWriter;
  sessionId: SessionId;
  message: string;
}) => {
  const eventStream = createEdgeSseEventStream({ writer: input.writer });
  const session = createInteractionSession({
    sessionId: input.sessionId,
    store,
    adapters: { model: createBuiltinModel() },
    eventStream,
  });
  return session.send({ role: "user", content: input.message });
};

const toSessionKey = (sessionId: SessionId) =>
  typeof sessionId === "string" ? sessionId : sessionId.sessionId;

const writeSseChunk = (input: { writer: SseWriter; chunk: string }) => {
  try {
    const result = input.writer.write(input.chunk);
    return mapMaybe(result, toTrue);
  } catch {
    return false;
  }
};

const writeSseChunks = (input: { writer: SseWriter; chunks: string[] }) => {
  try {
    const results = collectWrites(input.writer, input.chunks);
    return resolveWrites(results);
  } catch {
    return false;
  }
};

const formatSseEvent = (event: EventStreamEvent) =>
  `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;

const collectWrites = (writer: SseWriter, chunks: string[]) => {
  const results: Array<Promise<void> | void> = [];
  for (const chunk of chunks) {
    results.push(writer.write(chunk));
  }
  return results;
};

const toTrue = () => true;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { then?: unknown }).then === "function";

const mapMaybe = <TIn, TOut>(value: Promise<TIn> | TIn, map: (value: TIn) => TOut) => {
  if (isPromiseLike(value)) {
    return value.then(map);
  }
  return map(value);
};

const resolveWrites = (values: Array<Promise<void> | void>) => {
  const promises: Array<Promise<void>> = [];
  for (const value of values) {
    if (isPromiseLike(value)) {
      promises.push(value);
    }
  }
  if (promises.length === 0) {
    return true;
  }
  return Promise.all(promises).then(toTrue, toFalse);
};

const toFalse = () => false;
// #endregion docs
