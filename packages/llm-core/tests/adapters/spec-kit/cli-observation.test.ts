import { describe, expect, test } from "bun:test";
import {
  SPEC_KIT_CLI_SUPPORT,
  SPEC_KIT_FILE_SUPPORT,
  importSpecKitFiles,
  observeSpecKitCliVersion,
  observeSpecKitWorkflowStatus,
  type SpecKitFile,
} from "../../../src/adapters/spec-kit/public";
import { fixture, hash, importedFiles, observedAt, provenance } from "./spec-kit-test-fixtures";

describe("Spec Kit adapter", () => {
  test("observes run, resume, and status commands without conflating exit and stored outcome", () => {
    const version = observeSpecKitCliVersion({ observedAt, stdout: "specify 0.14.3.dev0\n" });
    expect(version.version).toBe("0.14.3.dev0");

    const failedRun = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "run",
      exitCode: 1,
      stdout: fixture("run-failed-c0fe0e4.json"),
    });
    expect(failedRun).toMatchObject({
      kind: "run-outcome",
      command: "run",
      status: "failed",
      commandExitCode: 1,
      runOutcome: "failed",
    });

    const pausedResume = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "resume",
      exitCode: 0,
      stdout: fixture("resume-paused-c0fe0e4.json"),
    });
    expect(pausedResume).toMatchObject({
      kind: "run-outcome",
      command: "resume",
      status: "paused",
      commandExitCode: 0,
      runOutcome: "non-terminal",
      gate: { stepId: "review", choice: null },
    });

    const run = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "status",
      exitCode: 0,
      stdout: fixture("status-run-aborted-c0fe0e4.json"),
    });
    expect(run).toMatchObject({
      kind: "run-status",
      command: "status",
      status: "aborted",
      gate: { stepId: "review", choice: "reject" },
      steps: { choose: "completed", review: "failed" },
      commandExitCode: 0,
      runOutcome: "failed",
    });

    const list = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "status",
      exitCode: 0,
      stdout: fixture("status-list-c0fe0e4.json"),
    });
    expect(list).toMatchObject({
      kind: "list-status",
      runs: [
        { status: "created", runOutcome: "non-terminal" },
        { status: "aborted", runOutcome: "failed" },
      ],
    });
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list.raw)).toBe(true);
  });

  test("enforces the complete native command by run-status matrix", () => {
    const commands = ["run", "resume", "status"] as const;
    const statuses = ["created", "running", "paused", "completed", "failed", "aborted"] as const;
    const commandStatuses = new Set(["paused", "completed", "failed", "aborted"]);

    for (const command of commands) {
      for (const status of statuses) {
        const exitCode =
          command !== "status" && (status === "failed" || status === "aborted") ? 1 : 0;
        const stdout = JSON.stringify({
          run_id: `matrix-${command}-${status}`,
          workflow_id: "speckit",
          status,
          current_step_id: null,
          current_step_index: 0,
          ...(command === "status"
            ? { created_at: observedAt, updated_at: observedAt, steps: {} }
            : {}),
        });
        const observe = () =>
          observeSpecKitWorkflowStatus({
            observedAt,
            version: "0.14.3.dev0",
            command,
            exitCode,
            stdout,
          });
        if (command === "status" || commandStatuses.has(status)) {
          expect(observe).not.toThrow();
        } else {
          expect(observe).toThrow("run/resume");
        }
      }
    }
  });

  test("rejects status shapes the pinned CLI never emits", () => {
    const payload = JSON.parse(fixture("status-run-aborted-c0fe0e4.json")) as Record<
      string,
      unknown
    >;
    payload.status = "cancelled";
    expect(() =>
      observeSpecKitWorkflowStatus({
        observedAt,
        version: "0.14.3.dev0",
        command: "status",
        exitCode: 0,
        stdout: JSON.stringify(payload),
      }),
    ).toThrow("run shape");
    expect(() => observeSpecKitCliVersion({ observedAt, stdout: "0.14.3.dev0" })).toThrow(
      "specify <version>",
    );
    expect(() =>
      observeSpecKitWorkflowStatus({
        observedAt,
        version: "0.14.3.dev0",
        command: "run",
        exitCode: 0,
        stdout: fixture("run-failed-c0fe0e4.json"),
      }),
    ).toThrow("exit code");
  });

  test("captures the whole input before getters can run and returns deep immutable data", () => {
    let getterRuns = 0;
    const hostile = Object.defineProperty(
      {
        revision: "r1",
        observedAt,
        files: [],
      },
      "sourceId",
      {
        enumerable: true,
        get() {
          getterRuns += 1;
          return "hostile";
        },
      },
    );
    expect(() => importSpecKitFiles(hostile as never)).toThrow("without getters");
    expect(getterRuns).toBe(0);

    const files: SpecKitFile[] = [
      {
        path: "notes.md",
        content: "# Notes",
        kind: "other",
        provenance: provenance("project", "project", 0),
      },
    ];
    const imported = importedFiles(files);
    (files[0] as { content: string }).content = "changed";
    const graph = imported.graph as {
      sources: { documents: { content: { text: string } }[] }[];
    };
    expect(graph.sources[0]?.documents[0]?.content.text).toBe("# Notes");
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(graph.sources[0]?.documents[0]?.content)).toBe(true);
  });

  test("binds support declarations to exact immutable fixture bytes", () => {
    expect(SPEC_KIT_FILE_SUPPORT).toMatchObject({
      levels: ["syntax", "semantic"],
      writeBack: "unsupported",
    });
    expect(SPEC_KIT_CLI_SUPPORT).toMatchObject({
      levels: ["syntax", "semantic"],
      writeBack: "unsupported",
    });
    expect(SPEC_KIT_FILE_SUPPORT.fixtures.map((item) => item.digest.value)).toEqual([
      hash(fixture("workflow-core-c0fe0e4.yml")),
      hash(fixture("workflow-control-flow-c0fe0e4.yml")),
      hash(fixture("workflow-overlay-installed-c0fe0e4.yml")),
    ]);
    expect(SPEC_KIT_CLI_SUPPORT.fixtures.map((item) => item.digest.value)).toEqual([
      hash(fixture("run-failed-c0fe0e4.json")),
      hash(fixture("resume-paused-c0fe0e4.json")),
      hash(fixture("status-run-aborted-c0fe0e4.json")),
      hash(fixture("status-list-c0fe0e4.json")),
    ]);
  });
});
