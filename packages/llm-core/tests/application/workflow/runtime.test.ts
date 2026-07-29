import { describe, expect, test } from "bun:test";
import { isPromiseLike } from "../../../src/shared/maybe";
import { isRegisteredResumableCheckpoint } from "../../../src/features/state/public";
import {
  composeWorkflow,
  createWorkflowRegistry,
  defineWorkflow,
  resumeWorkflow,
  runWorkflow,
  type ExecutableWorkflowStep,
  type WorkflowDefinition,
  type WorkflowExecutionOutcome,
} from "../../../src/application/workflow/public";

type State = { readonly values: readonly string[] };
type Pause = { readonly question: string };
type Resume = { readonly answer: string };
type Step = ExecutableWorkflowStep<State, Pause, Resume>;

const append = (value: string): Step => ({
  key: value,
  effect: "none",
  execute: ({ state }) => ({
    status: "continue",
    state: { values: [...state.values, value] },
  }),
});

const completed = (
  outcome: WorkflowExecutionOutcome<State, Pause>,
): Extract<WorkflowExecutionOutcome<State, Pause>, { status: "completed" }> => {
  expect(outcome.status).toBe("completed");
  if (outcome.status !== "completed") {
    throw new Error("Expected a completed workflow.");
  }
  return outcome;
};

describe("workflow application runtime", () => {
  test("preserves synchronous execution until a step becomes asynchronous", async () => {
    const sync = defineWorkflow({
      workflowId: "sync",
      version: "1",
      steps: [append("one"), append("two")],
    });
    const syncResult = runWorkflow(sync, { values: [] });
    expect(isPromiseLike(syncResult)).toBe(false);
    expect(completed(syncResult as WorkflowExecutionOutcome<State, Pause>).state.values).toEqual([
      "one",
      "two",
    ]);

    const asynchronous = defineWorkflow<State, Pause, Resume>({
      workflowId: "async",
      version: "1",
      steps: [
        append("one"),
        {
          key: "two",
          effect: "none",
          execute: async ({ state }) => ({
            status: "continue",
            state: { values: [...state.values, "two"] },
          }),
        },
      ],
    });
    const asyncResult = runWorkflow(asynchronous, { values: [] });
    expect(isPromiseLike(asyncResult)).toBe(true);
    expect(completed(await asyncResult).state.values).toEqual(["one", "two"]);
  });

  test("bounds retries and exposes the one-based attempt to the step", () => {
    const attempts: number[] = [];
    const workflow = defineWorkflow<State, Pause, Resume>({
      workflowId: "retry",
      version: "1",
      steps: [
        {
          key: "flaky",
          effect: "none",
          retry: { maxAttempts: 3, delayMs: 0 },
          execute: ({ state, attempt }) => {
            attempts.push(attempt);
            if (attempt < 3) {
              throw new Error("flaky");
            }
            return { status: "continue", state };
          },
        },
      ],
    });

    const result = runWorkflow(workflow, { values: [] });
    expect(completed(result as WorkflowExecutionOutcome<State, Pause>).completedStepKeys).toEqual([
      "flaky",
    ]);
    expect(attempts).toEqual([1, 2, 3]);
  });

  test("preserves asynchronous retry behavior without allowing an unbounded policy", async () => {
    let attempts = 0;
    const asynchronous = defineWorkflow<State, Pause, Resume>({
      workflowId: "async-retry",
      version: "1",
      steps: [
        {
          key: "flaky",
          effect: "none",
          retry: { maxAttempts: 2, delayMs: 1 },
          execute: async ({ state }) => {
            attempts += 1;
            if (attempts === 1) {
              throw new Error("flaky");
            }
            return { status: "continue", state };
          },
        },
      ],
    });
    expect(completed(await runWorkflow(asynchronous, { values: [] })).status).toBe("completed");
    expect(attempts).toBe(2);

    attempts = 0;
    const unbounded = defineWorkflow<State, Pause, Resume>({
      workflowId: "invalid-retry",
      version: "1",
      steps: [
        {
          key: "fail",
          effect: "none",
          retry: { maxAttempts: Number.POSITIVE_INFINITY },
          execute: () => {
            attempts += 1;
            throw new Error("failed");
          },
        },
      ],
    });
    expect(runWorkflow(unbounded, { values: [] })).toMatchObject({ status: "failed" });
    expect(attempts).toBe(1);
  });

  test("rejects meaningful-effect steps before workflow execution or retry", () => {
    let passiveExecutions = 0;
    let meaningfulExecutions = 0;
    let sleeps = 0;
    const unsafe = {
      workflowId: "unsafe-effect",
      version: "1",
      steps: [
        {
          key: "passive-before",
          effect: "none",
          execute: ({ state }: { readonly state: State }) => {
            passiveExecutions += 1;
            return { status: "continue", state };
          },
        },
        {
          key: "meaningful",
          effect: "meaningful",
          retry: { maxAttempts: 3, delayMs: 1 },
          execute: () => {
            meaningfulExecutions += 1;
            throw new Error("must never execute");
          },
        },
      ],
    } as unknown as WorkflowDefinition<State, Pause, Resume>;

    const outcome = runWorkflow(
      unsafe,
      { values: [] },
      {
        sleep: () => {
          sleeps += 1;
        },
      },
    );

    expect(outcome).toMatchObject({
      status: "failed",
      stepKey: "meaningful",
      error: expect.any(TypeError),
    });
    expect(passiveExecutions).toBe(0);
    expect(meaningfulExecutions).toBe(0);
    expect(sleeps).toBe(0);
  });

  test("stops at maxAttempts and rolls completed steps back in reverse order", () => {
    const events: string[] = [];
    const step = (key: string): Step => ({
      key,
      effect: "none",
      execute: ({ state }) => ({
        status: "continue",
        state: { values: [...state.values, key] },
      }),
      rollback: () => {
        events.push(`rollback:${key}`);
      },
    });
    let attempts = 0;
    const workflow = defineWorkflow<State, Pause, Resume>({
      workflowId: "rollback",
      version: "1",
      steps: [
        step("one"),
        step("two"),
        {
          key: "fail",
          effect: "none",
          retry: { maxAttempts: 2 },
          execute: () => {
            attempts += 1;
            throw new Error("failed");
          },
        },
      ],
    });

    const result = runWorkflow(workflow, { values: [] });
    expect(isPromiseLike(result)).toBe(false);
    expect(result).toMatchObject({ status: "failed", stepKey: "fail" });
    expect(attempts).toBe(2);
    expect(events).toEqual(["rollback:two", "rollback:one"]);
  });

  test("pauses and resumes the same step with opaque resume input", () => {
    const workflow = defineWorkflow<State, Pause, Resume>({
      workflowId: "approval",
      version: "1",
      steps: [
        append("before"),
        {
          key: "approval",
          effect: "none",
          execute: ({ state, resumeInput }) =>
            resumeInput
              ? {
                  status: "continue",
                  state: { values: [...state.values, resumeInput.answer] },
                }
              : {
                  status: "paused",
                  state,
                  pause: { question: "Proceed?" },
                },
        },
        append("after"),
      ],
    });

    const paused = runWorkflow(workflow, { values: [] });
    expect(paused).toMatchObject({
      status: "paused",
      snapshot: {
        kind: "workflow-pause-snapshot",
        durability: "ephemeral",
        checkpoint: false,
        nextStepIndex: 1,
        completedStepKeys: ["before"],
        pause: { question: "Proceed?" },
      },
    });
    if (isPromiseLike(paused) || paused.status !== "paused") {
      throw new Error("Expected a synchronous pause.");
    }
    expect(isRegisteredResumableCheckpoint(paused.snapshot)).toBe(false);
    const resumed = resumeWorkflow(workflow, {
      snapshot: paused.snapshot,
      resumeInput: { answer: "approved" },
    });
    expect(completed(resumed as WorkflowExecutionOutcome<State, Pause>).state.values).toEqual([
      "before",
      "approved",
      "after",
    ]);
  });

  test("rejects a meaningful-effect definition before resume execution", () => {
    const passive = defineWorkflow<State, Pause, Resume>({
      workflowId: "resume-effect-safety",
      version: "1",
      steps: [
        {
          key: "pause",
          effect: "none",
          execute: ({ state }) => ({
            status: "paused",
            state,
            pause: { question: "Proceed?" },
          }),
        },
      ],
    });
    const paused = runWorkflow(passive, { values: [] });
    if (isPromiseLike(paused) || paused.status !== "paused") {
      throw new Error("Expected a synchronous pause.");
    }

    let executions = 0;
    const unsafe = {
      workflowId: passive.workflowId,
      version: passive.version,
      steps: [
        {
          key: "pause",
          effect: "meaningful",
          retry: { maxAttempts: 3 },
          execute: () => {
            executions += 1;
            throw new Error("must never execute");
          },
        },
      ],
    } as unknown as WorkflowDefinition<State, Pause, Resume>;
    const outcome = resumeWorkflow(unsafe, {
      snapshot: paused.snapshot,
      resumeInput: { answer: "yes" },
    });

    expect(outcome).toMatchObject({
      status: "failed",
      stepKey: "pause",
      error: expect.any(TypeError),
    });
    expect(executions).toBe(0);
  });

  test("keeps definition composition separate from registry resolution", () => {
    const first = defineWorkflow<State, Pause, Resume>({
      workflowId: "first",
      version: "1",
      steps: [append("one")],
    });
    const second = defineWorkflow<State, Pause, Resume>({
      workflowId: "second",
      version: "1",
      steps: [append("two")],
    });
    const composed = composeWorkflow({
      workflowId: "composed",
      version: "1",
      definitions: [first, second],
      steps: [append("three")],
    });
    const registry = createWorkflowRegistry<State, Pause, Resume>();
    registry.register(composed);

    expect(registry.resolve("composed")).toBe(composed);
    expect(registry.resolve("first")).toBeUndefined();
    const result = runWorkflow(registry.resolve("composed")!, { values: [] });
    expect(completed(result as WorkflowExecutionOutcome<State, Pause>).state.values).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(() => registry.register(composed)).toThrow("already registered");
  });

  test("rejects duplicate composition keys and mismatched resume snapshots", () => {
    const first = defineWorkflow<State, Pause, Resume>({
      workflowId: "first",
      version: "1",
      steps: [append("same")],
    });
    expect(() =>
      composeWorkflow({
        workflowId: "invalid",
        version: "1",
        definitions: [first, first],
      }),
    ).toThrow("unique");

    const pausedWorkflow = defineWorkflow<State, Pause, Resume>({
      workflowId: "paused",
      version: "1",
      steps: [
        {
          key: "pause",
          effect: "none",
          execute: ({ state }) => ({
            status: "paused",
            state,
            pause: { question: "Proceed?" },
          }),
        },
      ],
    });
    const paused = runWorkflow(pausedWorkflow, { values: [] });
    if (isPromiseLike(paused) || paused.status !== "paused") {
      throw new Error("Expected a pause.");
    }
    const other = defineWorkflow<State, Pause, Resume>({
      workflowId: "other",
      version: "1",
      steps: [],
    });
    expect(
      resumeWorkflow(other, {
        snapshot: paused.snapshot,
        resumeInput: { answer: "yes" },
      }),
    ).toMatchObject({
      status: "failed",
    });
  });
});
