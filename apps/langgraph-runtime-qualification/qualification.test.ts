import { describe, expect, test } from "bun:test";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import langGraphPackage from "@langchain/langgraph/package.json" with { type: "json" };

const State = Annotation.Root({
  value: Annotation<string>,
  trace: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  result: Annotation<string>,
});

const config = (threadId: string) => ({ configurable: { thread_id: threadId } });

const waitForAbort = async (signal: AbortSignal | undefined, observed: () => void) =>
  new Promise<void>((resolve) => {
    signal?.addEventListener(
      "abort",
      () => {
        observed();
        resolve();
      },
      { once: true },
    );
  });

const cancellableNode =
  (started: PromiseWithResolvers<void>, observed: () => void) =>
  async (_state: typeof State.State, runnableConfig: { signal?: AbortSignal }) => {
    started.resolve();
    await waitForAbort(runnableConfig.signal, observed);
    throw new Error("cancelled");
  };

describe("exact LangGraph runtime qualification", () => {
  test("pins the installed dependency", () => {
    expect(langGraphPackage.name).toBe("@langchain/langgraph");
    expect(langGraphPackage.version).toBe("1.0.7");
  });

  test("retains reducers, checkpoints, and independent threads", async () => {
    const checkpointer = new MemorySaver();
    const graph = new StateGraph(State)
      .addNode("left", () => ({ trace: ["left"] }))
      .addNode("right", () => ({ trace: ["right"] }))
      .addNode("finish", (state) => ({
        result: `${state.value}:${[...state.trace].sort().join("+")}`,
      }))
      .addEdge(START, "left")
      .addEdge(START, "right")
      .addEdge(["left", "right"], "finish")
      .addEdge("finish", END)
      .compile({ checkpointer });

    expect(await graph.invoke({ value: "first" }, config("thread-a"))).toMatchObject({
      result: "first:left+right",
    });
    expect(await graph.invoke({ value: "second" }, config("thread-b"))).toMatchObject({
      result: "second:left+right",
    });

    const [first, second] = await Promise.all([
      graph.getState(config("thread-a")),
      graph.getState(config("thread-b")),
    ]);
    expect(first.config.configurable?.thread_id).toBe("thread-a");
    expect(second.config.configurable?.thread_id).toBe("thread-b");
    expect(first.config.configurable?.checkpoint_id).toBeString();
    expect(second.config.configurable?.checkpoint_id).toBeString();
    expect(first.config.configurable?.checkpoint_id).not.toBe(
      second.config.configurable?.checkpoint_id,
    );
  });

  test("pauses and resumes an interrupt in the same native thread", async () => {
    const graph = new StateGraph(State)
      .addNode("approval", (state) => ({
        result: `${state.value}:${interrupt<{ question: string }, string>({ question: "Continue?" })}`,
      }))
      .addEdge(START, "approval")
      .addEdge("approval", END)
      .compile({ checkpointer: new MemorySaver() });
    const thread = config("interrupt-thread");

    await graph.invoke({ value: "work" }, thread);
    const paused = await graph.getState(thread);
    expect(paused.next).toEqual(["approval"]);
    expect(paused.tasks[0]?.interrupts).toHaveLength(1);

    expect(await graph.invoke(new Command({ resume: "approved" }), thread)).toMatchObject({
      result: "work:approved",
    });
    expect((await graph.getState(thread)).next).toEqual([]);
  });

  test("propagates an AbortSignal into a running node", async () => {
    let observedAbort = false;
    const started = Promise.withResolvers<void>();
    const graph = new StateGraph(State)
      .addNode(
        "wait",
        cancellableNode(started, () => {
          observedAbort = true;
        }),
      )
      .addEdge(START, "wait")
      .addEdge("wait", END)
      .compile();
    const controller = new AbortController();
    const invocation = graph.invoke(
      { value: "cancel" },
      { ...config("cancel-thread"), signal: controller.signal },
    );
    await started.promise;
    controller.abort();

    await expect(invocation).rejects.toThrow();
    expect(observedAbort).toBe(true);
  });
});
