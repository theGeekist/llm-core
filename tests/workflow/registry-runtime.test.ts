import { describe, expect, it } from "bun:test";
import type { Model, Retriever } from "#adapters";
import {
  assertSyncOutcome,
  createResumeSnapshot,
  createSessionStore,
  makeRuntime,
} from "./helpers";

describe("Workflow registry routing", () => {
  it("routes runs through builtin providers when no adapters are supplied", () => {
    let captured: unknown;
    const runtime = makeRuntime("agent", {
      includeDefaults: false,
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as { adapters?: { model?: Model } };
    expect(resolved.adapters?.model).toBeDefined();
  });

  it("prefers plugin-provided adapters over builtins", () => {
    let captured: unknown;
    const model: Model = {
      generate: () => ({ text: "custom" }),
    };
    const marker = { id: "plugin-doc", text: "plugin" };
    const retriever: Retriever = {
      retrieve: () => ({ documents: [marker] }),
    };
    const runtime = makeRuntime("rag", {
      includeDefaults: false,
      plugins: [{ key: "custom.adapters", adapters: { model, retriever } }],
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as {
      adapters?: { model?: Model; retriever?: Retriever };
    };
    expect(resolved.adapters?.model).toBe(model);
    const retrieved = resolved.adapters?.retriever?.retrieve("q");
    expect(retrieved && typeof retrieved === "object").toBe(true);
    const result = retrieved as { documents?: unknown[] };
    expect(result.documents?.[0]).toBe(marker);
  });

  it("re-resolves providers during resume using provider overrides", () => {
    let captured: unknown;
    const { sessionStore } = createSessionStore();
    sessionStore.set("token", createResumeSnapshot("token"));
    const model: Model = {
      generate: () => ({ text: "override" }),
    };
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [{ key: "override.adapters", adapters: { model } }],
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error("Expected resume to be available.");
    }

    const outcome = assertSyncOutcome(
      runtime.resume("token", undefined, {
        resume: {
          sessionStore,
          resolve: () => ({
            input: { token: "token" },
            providers: { model: "override.adapters:model" },
          }),
        },
      }),
    );

    expect(outcome.status).toBe("ok");
    const resolved = captured as { adapters?: { model?: Model } };
    expect(resolved.adapters?.model).toBe(model);
  });
});
