import { describe, expect, it } from "bun:test";
import { createRuntime } from "#workflow/runtime";
import { getContract, withFactory } from "./helpers";

describe("Workflow extensions", () => {
  it("ignores overridden plugins when registering extensions", async () => {
    const calls: string[] = [];
    const contract = getContract("rag");
    const runtime = createRuntime({
      contract,
      plugins: [
        {
          key: "ext.base",
          register: () => {
            calls.push("base");
            return undefined;
          },
        },
        {
          key: "ext.override",
          mode: "override",
          overrideKey: "ext.base",
          register: () => {
            calls.push("override");
            return undefined;
          },
        },
      ],
      pipelineFactory: withFactory(
        () =>
          ({
            run: () => ({ artifact: { ok: true } }),
            extensions: {
              use: (extension: { register?: () => unknown }) => {
                extension.register?.();
              },
            },
          }) as never,
      ),
    });

    const outcome = await runtime.run({ input: "extensions" });
    expect(outcome.status).toBe("ok");
    expect(calls).toEqual(["override"]);
  });

  it("registers hook plugins for scheduled lifecycles", async () => {
    const registrations: { lifecycle?: string; hasHook: boolean }[] = [];
    const contract = getContract("rag");
    const runtime = createRuntime({
      contract,
      plugins: [
        {
          key: "hook.plugin",
          lifecycle: "beforeRetrieve",
          hook: () => undefined,
        },
      ],
      pipelineFactory: withFactory(
        () =>
          ({
            run: () => ({ artifact: { ok: true } }),
            extensions: {
              use: (extension: { register?: () => { lifecycle?: string; hook?: unknown } }) => {
                const registration = extension.register?.();
                registrations.push({
                  lifecycle: registration?.lifecycle,
                  hasHook: typeof registration?.hook === "function",
                });
              },
            },
          }) as never,
      ),
    });

    const outcome = await runtime.run({ input: "hooks" });
    expect(outcome.status).toBe("ok");
    expect(registrations).toEqual([{ lifecycle: "beforeRetrieve", hasHook: true }]);
  });

  it("waits for async extension registration before run", async () => {
    let registered = false;
    const contract = getContract("rag");
    const runtime = createRuntime({
      contract,
      plugins: [
        {
          key: "async.register",
          register: () => undefined,
        },
      ],
      pipelineFactory: withFactory(
        () =>
          ({
            run: () => {
              if (!registered) {
                throw new Error("Extension not registered yet.");
              }
              return { artifact: { ok: true } };
            },
            extensions: {
              use: () =>
                new Promise<void>((resolve) => {
                  setTimeout(() => {
                    registered = true;
                    resolve();
                  }, 0);
                }),
            },
          }) as never,
      ),
    });

    const outcome = await runtime.run({ input: "extensions-async" });
    expect(outcome.status).toBe("ok");
  });
});
