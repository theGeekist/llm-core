import { describe, expect, it } from "bun:test";
import type { Message } from "#adapters";
import { createInteractionSessionRuntime } from "../../src/interaction/runtime";
import { createMockMessage, createMockModel, createMockSessionStore } from "../fixtures/factories";

const createMessage = (text: string): Message => createMockMessage(text, "user");

describe("interaction session runtime", () => {
  it("creates and loads session ids", async () => {
    const store = createMockSessionStore();
    const runtime = createInteractionSessionRuntime({
      store: store.store,
      createSessionId: () => "session-1",
    });

    const sessionId = await runtime.create();
    const state = await runtime.load(sessionId);

    expect(sessionId).toBe("session-1");
    expect(state).toBeNull();
    expect(store.calls.load).toBe(1);
  });

  it("streams messages through the session", async () => {
    const store = createMockSessionStore();
    const model = createMockModel("hi");
    const runtime = createInteractionSessionRuntime({
      store: store.store,
      createSessionId: () => "session-2",
      adapters: { model },
    });

    const result = await runtime.stream({
      sessionId: "session-2",
      message: createMessage("hello"),
    });

    if ("artefact" in result) {
      expect(result.artefact).toBeDefined();
    }
    expect(store.calls.save).toBe(1);
  });
});
