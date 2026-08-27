import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreId, externalId, type EvidenceId } from "@geekist/llm-core/contracts";
import { renderHeadlessWorkbenchStatus } from "../../../src/application/headless-workbench/public.js";
import { contentDigest } from "../../../src/config/content-digest.js";
import { createFileProjectJournal } from "../../../src/project-semantics/adapters/file-journal/public.js";
import type {
  CorrelationId,
  RuntimeNeutralProjectView,
} from "../../../src/project-semantics/public.js";
import { createHeadlessWorkbenchCli } from "../../../src/project-semantics/adapters/cli/public.js";
import {
  HEADLESS_WORKBENCH_MCP_TOOL,
  createHeadlessWorkbenchMcp,
} from "../../../src/project-semantics/adapters/mcp/public.js";
import type { CorpusFixture } from "../../project-semantics/repository-corpus/fixtures/corpus.js";
import {
  corpusEventId,
  createCorpusFixture,
} from "../../project-semantics/repository-corpus/fixtures/corpus.js";
import { fixtureNativeAuthority, workbench } from "./workbench-fixture.js";

let fixture: CorpusFixture | null = null;
let journalDirectory: string | null = null;

afterEach(async () => {
  await fixture?.dispose();
  fixture = null;
  if (journalDirectory !== null) await rm(journalDirectory, { force: true, recursive: true });
  journalDirectory = null;
});

describe("headless project workbench", () => {
  test("causally supersedes an earlier repository snapshot when native state changes", async () => {
    fixture = await createCorpusFixture();
    const current = fixture;
    const instance = workbench();
    const first = await instance.dispatch({
      correlationId: externalId("workbench-supersession"),
      eventId: corpusEventId(20),
      kind: "recordObservation",
      operationId: "workbench-supersession-1",
      source: current.source,
    });
    if (!first.ok || first.value.view === undefined) throw new Error("first import failed");
    current.state.dirtyPaths = ["packages/ready/dirty.ts"];

    const corrected = await instance.dispatch({
      correlationId: externalId("workbench-supersession"),
      eventId: corpusEventId(21),
      kind: "recordObservation",
      operationId: "workbench-supersession-2",
      source: current.source,
    });

    if (
      !corrected.ok ||
      corrected.value.journal === undefined ||
      corrected.value.view === undefined
    )
      throw new Error("corrected import failed");
    expect(corrected.value.journal.event).toEqual(
      expect.objectContaining({
        causationId: corpusEventId(20),
        kind: "correction.accepted",
      }),
    );
    expect(
      corrected.value.view.assertions.some(({ assertion }) => assertion.retractedBy !== null),
    ).toBeTrue();
    expect(
      corrected.value.view.tasks.find(({ taskId }) => taskId === "task:aifsd/ready")?.readiness,
    ).toBe("ready");
    expect(
      corrected.value.view.tasks.find(({ taskId }) => taskId === "task:aifsd/ready")
        ?.contradictionAssertionIds,
    ).toEqual([]);
  });

  test("serialises concurrent event replays and binds context to its repository project", async () => {
    fixture = await createCorpusFixture();
    const instance = workbench();
    const duplicate = {
      correlationId: externalId<CorrelationId>("concurrent-replay"),
      eventId: corpusEventId(9),
      kind: "recordObservation" as const,
      source: fixture.source,
    };
    const replay = await Promise.all(
      ["one", "two"].map((suffix) =>
        instance.dispatch({ ...duplicate, operationId: `concurrent-replay-${suffix}` }),
      ),
    );
    const dispositions = replay.map((result) => {
      if (!result.ok || result.value.journal === undefined) throw new Error("replay failed");
      return result.value.journal.appendDisposition;
    });
    expect(dispositions.sort()).toEqual(["already-present", "appended"]);

    const cli = createHeadlessWorkbenchCli({
      authorise: () => true,
      corpusSource: fixture.source,
      workbench: instance,
    });
    const foreignContext = await cli.execute(
      JSON.stringify({
        correlationId: "foreign-context",
        eventId: corpusEventId(10),
        kind: "compileTaskContext",
        operationId: "foreign-context-1",
        projectId: "repository:another-project",
        taskKey: "aifsd/ready",
      }),
    );
    expect(foreignContext).toEqual({
      exitCode: 1,
      output: JSON.stringify({
        ok: false,
        diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
      }),
    });
  });

  test("reports one atomic append across independent workbenches sharing a durable journal", async () => {
    fixture = await createCorpusFixture();
    journalDirectory = await mkdtemp(join(tmpdir(), "aifsd-workbench-journal-"));
    const journalPath = join(journalDirectory, "project-journal.json");
    const digester = { digest: contentDigest };
    const first = workbench({ journal: createFileProjectJournal(journalPath, digester) });
    const second = workbench({ journal: createFileProjectJournal(journalPath, digester) });
    const operation = {
      correlationId: externalId<CorrelationId>("independent-durable-replay"),
      eventId: corpusEventId(19),
      kind: "recordObservation" as const,
      source: fixture.source,
    };

    const results = await Promise.all([
      first.dispatch({ ...operation, operationId: "independent-durable-replay-first" }),
      second.dispatch({ ...operation, operationId: "independent-durable-replay-second" }),
    ]);
    const dispositions = results.map((result) => {
      if (!result.ok || result.value.journal === undefined) throw new Error("admission failed");
      return result.value.journal.appendDisposition;
    });
    expect(dispositions.sort()).toEqual(["already-present", "appended"]);
  });

  test("preserves admission time ordering across a native receipt followed by corpus capture", async () => {
    fixture = await createCorpusFixture();
    const nativeAuthority = fixtureNativeAuthority(async (operation) => ({
      ok: true,
      value: {
        observation: {
          observationId: "native-receipt-before-corpus",
          projectId: operation.projectId,
          kind: "observation.accepted",
          sourceAuthority: { authorityId: "fixture-native-authority", kind: "integration" },
          provenance: { sourceKind: "integration", sourceRef: "fixture-native" },
          evidence: [coreId<EvidenceId>("018f1000-0000-7000-8000-000000000099")],
          correlationId: operation.correlationId,
          observedAt: "2026-08-21T00:01:00Z",
          payload: { kind: "native-task-authority-receipt" },
        },
        nativeResult: { kind: "receipt" },
      },
    }));
    const instance = workbench({ monotonicAdmission: true, ...nativeAuthority });
    const native = await instance.dispatch({
      correlationId: externalId("mixed-clock-native"),
      eventId: corpusEventId(30),
      kind: "claimTask",
      leaseExpiresAt: "2026-08-21T01:00:00Z",
      operationId: "mixed-clock-native-1",
      projectId: "repository:fixture-project",
      taskKey: "aifsd/ready",
    });
    expect(native.ok).toBeTrue();

    fixture.time.now = "2026-08-21T00:00:11Z";
    const corpus = await instance.dispatch({
      correlationId: externalId("mixed-clock-corpus"),
      eventId: corpusEventId(31),
      kind: "recordObservation",
      operationId: "mixed-clock-corpus-1",
      source: fixture.source,
    });
    expect(corpus).toEqual(expect.objectContaining({ ok: true }));
  });

  test("serialises concurrent identical native operations before provider execution", async () => {
    let nativeExecuteCalls = 0;
    const nativeAuthority = fixtureNativeAuthority(async (operation) => {
      nativeExecuteCalls += 1;
      await Promise.resolve();
      return {
        ok: true,
        value: {
          observation: {
            observationId: "native-concurrent-receipt",
            projectId: operation.projectId,
            kind: "observation.accepted",
            sourceAuthority: { authorityId: "fixture-native-authority", kind: "integration" },
            provenance: { sourceKind: "integration", sourceRef: "fixture-native" },
            evidence: [coreId<EvidenceId>("018f1000-0000-7000-8000-000000000097")],
            correlationId: operation.correlationId,
            observedAt: "2026-08-22T00:00:10Z",
            payload: { kind: "native-task-authority-receipt", receiptId: "concurrent" },
          },
          nativeResult: { kind: "receipt", receiptId: "concurrent" },
        },
      };
    });
    const instance = workbench({ monotonicAdmission: true, ...nativeAuthority });
    const operation = {
      correlationId: externalId<CorrelationId>("native-concurrent"),
      eventId: corpusEventId(33),
      kind: "claimTask" as const,
      leaseExpiresAt: "2026-08-22T01:00:00Z",
      operationId: "native-concurrent-1",
      projectId: "repository:fixture-project",
      taskKey: "aifsd/ready",
    };

    const results = await Promise.all([instance.dispatch(operation), instance.dispatch(operation)]);
    expect(nativeExecuteCalls).toBe(1);
    expect(
      results.map((result) => {
        if (!result.ok || result.value.journal === undefined) throw new Error("native failed");
        return result.value.journal.appendDisposition;
      }),
    ).toEqual(["appended", "already-present"]);
  });

  test("replays the same native receipt without reallocating admission time", async () => {
    let nativeExecuteCalls = 0;
    const nativeAuthority = fixtureNativeAuthority(async (operation) => {
      nativeExecuteCalls += 1;
      return {
        ok: true,
        value: {
          observation: {
            observationId: "native-receipt-replay",
            projectId: operation.projectId,
            kind: "observation.accepted",
            sourceAuthority: { authorityId: "fixture-native-authority", kind: "integration" },
            provenance: { sourceKind: "integration", sourceRef: "fixture-native" },
            evidence: [coreId<EvidenceId>("018f1000-0000-7000-8000-000000000098")],
            correlationId: operation.correlationId,
            observedAt: "2026-08-22T00:00:10Z",
            payload: { kind: "native-task-authority-receipt", receiptId: "receipt-replay" },
          },
          nativeResult: { kind: "receipt", receiptId: "receipt-replay" },
        },
      };
    });
    let decisionNow = "2026-08-22T00:00:20Z";
    journalDirectory = await mkdtemp(join(tmpdir(), "aifsd-native-replay-journal-"));
    const journalPath = join(journalDirectory, "project-journal.json");
    const digester = { digest: contentDigest };
    const firstInstance = workbench({
      decisionNow: () => decisionNow,
      journal: createFileProjectJournal(journalPath, digester),
      monotonicAdmission: true,
      ...nativeAuthority,
    });
    const operation = {
      correlationId: externalId<CorrelationId>("native-receipt-replay"),
      eventId: corpusEventId(32),
      kind: "claimTask" as const,
      leaseExpiresAt: "2026-08-22T01:00:00Z",
      operationId: "native-receipt-replay-1",
      projectId: "repository:fixture-project",
      taskKey: "aifsd/ready",
    };
    const first = await firstInstance.dispatch(operation);
    if (!first.ok || first.value.journal === undefined) throw new Error("native admission failed");
    expect(first.value.journal.appendDisposition).toBe("appended");

    decisionNow = "2026-08-22T00:00:30Z";
    const restartedInstance = workbench({
      decisionNow: () => decisionNow,
      journal: createFileProjectJournal(journalPath, digester),
      monotonicAdmission: true,
      nativeTaskIntents: nativeAuthority.nativeTaskIntents,
      nativeTaskReceipts: nativeAuthority.nativeTaskReceipts,
    });
    const replay = await restartedInstance.dispatch(operation);
    if (!replay.ok || replay.value.journal === undefined) throw new Error("native replay failed");
    expect(replay.value.journal.appendDisposition).toBe("already-present");
    expect(replay.value.journal.event.admittedAt).toBe("2026-08-22T00:00:20.000Z");
    expect(replay.value.nativeResult).toEqual({ kind: "receipt", receiptId: "receipt-replay" });
    expect(nativeExecuteCalls).toBe(1);

    const substituted = await restartedInstance.dispatch({
      ...operation,
      leaseExpiresAt: "2026-08-22T02:00:00Z",
    });
    expect(substituted).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
    expect(nativeExecuteCalls).toBe(1);
  });

  test("does not treat directly admitted receipt-shaped JSON as native receipt authority", async () => {
    let nativeExecuteCalls = 0;
    const nativeAuthority = fixtureNativeAuthority(async () => {
      nativeExecuteCalls += 1;
      throw new Error("native execution must not run for a forged persisted event");
    });
    const instance = workbench({ ...nativeAuthority });
    const eventId = corpusEventId(34);
    const correlationId = externalId<CorrelationId>("forged-native-receipt");
    const forged = await instance.dispatch({
      correlationId,
      eventId,
      kind: "admitTask",
      observation: {
        correlationId,
        evidence: [coreId<EvidenceId>("018f1000-0000-7000-8000-000000000096")],
        kind: "observation.accepted",
        observationId: "forged-native-receipt",
        observedAt: "2026-08-22T00:00:10Z",
        payload: { kind: "native-task-authority-receipt", receiptId: "forged" },
        projectId: "repository:fixture-project",
        provenance: { sourceKind: "integration", sourceRef: "forged" },
        sourceAuthority: { authorityId: "forged", kind: "integration" },
      },
      operationId: "forge-native-receipt",
    });
    expect(forged.ok).toBeTrue();

    const replay = await instance.dispatch({
      correlationId,
      eventId,
      kind: "claimTask",
      leaseExpiresAt: "2026-08-22T01:00:00Z",
      operationId: "replay-forged-native-receipt",
      projectId: "repository:fixture-project",
      taskKey: "aifsd/ready",
    });
    expect(replay).toEqual({
      ok: false,
      diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
    });
    expect(nativeExecuteCalls).toBe(0);
  });

  test("renders a divergence from any observed native STATUS.md authority", () => {
    const status = renderHeadlessWorkbenchStatus({
      assertions: [
        {
          assertion: {
            object: { matchesTaskLifecycle: false, mismatches: ["aifsd/active"], path: "aifsd" },
            predicate: "project.status-projection",
            retractedBy: null,
          },
        },
        {
          assertion: {
            object: { matchesTaskLifecycle: true, mismatches: [], path: "llm-core" },
            predicate: "project.status-projection",
            retractedBy: null,
          },
        },
      ],
      journalCheckpoint: { position: 2 },
      projectId: "repository:fixture-project",
      projectionDigest: contentDigest("status"),
      tasks: [],
    } as unknown as RuntimeNeutralProjectView);
    expect(status.markdown).toContain("Native STATUS.md: divergent (aifsd: aifsd/active)");
  });

  test("admits the imported corpus, renders generated projections and keeps delivery adapters equivalent", async () => {
    fixture = await createCorpusFixture();
    const instance = workbench();
    const corpus = await instance.dispatch({
      correlationId: externalId("workbench-import"),
      eventId: corpusEventId(1),
      kind: "recordObservation",
      operationId: "workbench-import-1",
      source: fixture.source,
    });
    expect(corpus).toEqual(expect.objectContaining({ ok: true }));
    if (!corpus.ok || corpus.value.view === undefined) throw new Error("corpus admission failed");
    expect(corpus.value.journal).toEqual(
      expect.objectContaining({
        appendDisposition: "appended",
        checkpoint: expect.objectContaining({ position: 1 }),
        event: expect.objectContaining({ eventId: corpusEventId(1) }),
      }),
    );
    expect(corpus.value.view.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: "task:aifsd/completed", readiness: "complete" }),
        expect.objectContaining({ taskId: "task:aifsd/conflicted", readiness: "ready" }),
      ]),
    );
    const replay = await instance.dispatch({
      correlationId: externalId("workbench-import"),
      eventId: corpusEventId(1),
      kind: "recordObservation",
      operationId: "workbench-import-1",
      source: fixture.source,
    });
    expect(replay).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          journal: expect.objectContaining({ appendDisposition: "already-present" }),
        }),
      }),
    );
    const compiled = await instance.dispatch({
      correlationId: externalId("workbench-context"),
      eventId: corpusEventId(2),
      kind: "compileTaskContext",
      operationId: "workbench-context-1",
      projectId: "repository:fixture-project",
      source: fixture.source,
      taskKey: "aifsd/ready",
    });
    expect(compiled).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ context: expect.any(Object) }),
      }),
    );
    const statusWire = {
      correlationId: "workbench-status",
      kind: "projectStatus",
      operationId: "workbench-status-1",
      projectId: "repository:fixture-project",
    } as const;
    const delivery = { corpusSource: fixture.source, workbench: instance };
    const cli = await createHeadlessWorkbenchCli({
      ...delivery,
      authorise: () => true,
    }).execute(JSON.stringify(statusWire));
    const rejectedCli = await createHeadlessWorkbenchCli({
      ...delivery,
      authorise: () => false,
    }).execute(JSON.stringify(statusWire));
    const mcp = await createHeadlessWorkbenchMcp(delivery, {
      authorise: async () => true,
    }).callTool(HEADLESS_WORKBENCH_MCP_TOOL, "fixture-operator", statusWire);
    expect(cli.exitCode).toBe(0);
    expect(rejectedCli).toEqual({
      exitCode: 1,
      output: JSON.stringify({
        ok: false,
        diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
      }),
    });
    const cliResult = JSON.parse(cli.output) as typeof mcp;
    expect(cliResult).toEqual(mcp);
    if (!mcp.ok || mcp.value.status === undefined) throw new Error("status projection failed");
    expect(mcp.value.status.markdown).toContain("AIFSD Headless Workbench Status");
    expect(mcp.value.status.markdown).toContain("Native STATUS.md: verified");
    expect(mcp.value.status.markdown).toContain("| aifsd/active | claimed | blocked |");
    expect(mcp.value.status.mermaid).toContain("flowchart TD");
    const denied = await createHeadlessWorkbenchMcp(delivery, {
      authorise: async () => false,
    }).callTool(HEADLESS_WORKBENCH_MCP_TOOL, "unauthorised", statusWire);
    expect(denied).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
  });
});
