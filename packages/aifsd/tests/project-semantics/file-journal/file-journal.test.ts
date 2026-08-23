import { afterEach, describe, expect, test } from "bun:test";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coreId,
  externalId,
  type CorrelationId,
  type EventId,
  type EvidenceId,
} from "@geekist/llm-core/contracts";
import { createFileProjectJournal } from "../../../src/project-semantics/adapters/file-journal/public.js";
import type { FileJournalCommitPhase } from "../../../src/project-semantics/adapters/file-journal/public.js";
import { admitProjectEvent } from "../../../src/project-semantics/admission.js";
import { contentDigest } from "../../../src/config/content-digest.js";

let directory: string | null = null;

afterEach(async () => {
  if (directory !== null) await rm(directory, { force: true, recursive: true });
  directory = null;
});

const digester = { digest: contentDigest };

const admissionInput = (sequence = 1, projectId = "repository:durable-fixture") => {
  const suffix = sequence.toString().padStart(12, "0");
  return {
    eventId: coreId<EventId>(`018f2000-0000-7000-8000-${suffix}`),
    observation: {
      observationId: `durable-journal-observation-${sequence}`,
      projectId,
      kind: "observation.accepted" as const,
      sourceAuthority: { authorityId: "durable-fixture-source", kind: "integration" as const },
      provenance: { sourceKind: "repository" as const, sourceRef: "fixture" },
      evidence: [coreId<EvidenceId>(`018f2001-0000-7000-8000-${suffix}`)],
      correlationId: externalId<CorrelationId>(`durable-fixture-correlation-${sequence}`),
      observedAt: "2026-08-22T00:00:00Z",
      payload: { fixture: sequence },
    },
  };
};

const acceptedEvent = async (sequence = 1, projectId = "repository:durable-fixture") => {
  const admitted = await admitProjectEvent(
    admissionInput(sequence, projectId),
    {
      authorityId: "durable-fixture-admission",
      decide: () => ({
        authority: { authorityId: "durable-fixture-admission", kind: "coordinator" },
        decidedAt: "2026-08-22T00:00:01Z",
        decisionId: `durable-fixture-decision-${sequence}`,
        policyId: "durable-fixture-policy",
      }),
    },
    digester,
  );
  if (!admitted.ok) throw new Error("fixture admission failed");
  return admitted.value;
};

describe("file project journal", () => {
  test("survives restart with the same checkpoint and accepted event", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const first = createFileProjectJournal(path, digester);
    expect((await first.append(await acceptedEvent())).ok).toBeTrue();

    const restarted = createFileProjectJournal(path, digester);
    expect(await restarted.read("repository:durable-fixture")).toEqual([
      expect.objectContaining({ eventId: coreId("018f2000-0000-7000-8000-000000000001") }),
    ]);
    expect(await restarted.checkpoint("repository:durable-fixture")).toEqual(
      expect.objectContaining({
        lastEventId: coreId("018f2000-0000-7000-8000-000000000001"),
        position: 1,
      }),
    );
  });

  test("serialises concurrent writers from independent journal instances", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const first = createFileProjectJournal(path, digester);
    const second = createFileProjectJournal(path, digester);
    const results = await Promise.all([
      first.append(await acceptedEvent(1, "repository:first-project")),
      second.append(await acceptedEvent(2, "repository:second-project")),
    ]);
    expect(results.every(({ ok }) => ok)).toBeTrue();

    const restarted = createFileProjectJournal(path, digester);
    expect(await restarted.read("repository:first-project")).toHaveLength(1);
    expect(await restarted.read("repository:second-project")).toHaveLength(1);
  });

  test("recognises an advancing-clock replay before authority invocation after restart", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const request = admissionInput();
    const first = createFileProjectJournal(path, digester);
    const authorityId = "durable-fixture-admission";
    const admitted = await first.admit(request, {
      authorityId,
      decide: () => ({
        authority: { authorityId, kind: "coordinator" },
        decidedAt: "2026-08-22T00:00:20Z",
        decisionId: "durable-fixture-first-decision",
        policyId: "durable-fixture-policy",
      }),
    });
    if (!admitted.ok) throw new Error("initial admission failed");
    expect(admitted.value.disposition).toBe("appended");

    let replayAuthorityCalls = 0;
    const restarted = createFileProjectJournal(path, digester);
    const replay = await restarted.admit(request, {
      authorityId,
      decide: () => {
        replayAuthorityCalls += 1;
        return {
          authority: { authorityId, kind: "coordinator" },
          decidedAt: "2026-08-22T00:00:30Z",
          decisionId: "durable-fixture-replay-decision",
          policyId: "durable-fixture-policy",
        };
      },
    });
    if (!replay.ok) throw new Error("replay admission failed");
    expect(replay.value.disposition).toBe("already-present");
    expect(replay.value.event).toEqual(admitted.value.event);
    expect(replayAuthorityCalls).toBe(0);

    const conflict = await restarted.admit(
      {
        ...request,
        observation: { ...request.observation, payload: { fixture: "substituted" } },
      },
      {
        authorityId,
        decide: () => {
          throw new Error("conflicting replay must not reach authority");
        },
      },
    );
    expect(conflict).toEqual({
      ok: false,
      diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
    });

    const substitutedProjectRequest = {
      ...request,
      observation: { ...request.observation, projectId: "repository:substituted-project" },
    };
    const projectConflict = await restarted.admit(substitutedProjectRequest, {
      authorityId,
      decide: () => {
        throw new Error("project-substituted replay must not reach authority");
      },
    });
    expect(projectConflict).toEqual({
      ok: false,
      diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
    });
    expect(await restarted.read("repository:substituted-project")).toEqual([]);

    const substitutedReceipt = await admitProjectEvent(
      substitutedProjectRequest,
      {
        authorityId,
        decide: () => ({
          authority: { authorityId, kind: "coordinator" },
          decidedAt: "2026-08-22T00:00:30Z",
          decisionId: "durable-fixture-substituted-project",
          policyId: "durable-fixture-policy",
        }),
      },
      digester,
    );
    if (!substitutedReceipt.ok) throw new Error("substituted receipt fixture failed");
    const independent = createFileProjectJournal(path, digester);
    expect(await independent.append(substitutedReceipt.value)).toEqual({
      ok: false,
      diagnostics: [{ code: "journal-conflict", reasonCode: "event-id-conflict" }],
    });
    expect(await independent.read("repository:substituted-project")).toEqual([]);
  });

  test("does not steal a live writer lock while its transaction is paused", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    let releaseDigest: (() => void) | undefined;
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve;
    });
    const first = createFileProjectJournal(
      path,
      {
        digest: async (value) => {
          await digestGate;
          return contentDigest(value);
        },
      },
      { lockRetryMs: 5, lockTimeoutMs: 1_000 },
    );
    const second = createFileProjectJournal(path, digester, {
      lockRetryMs: 5,
      lockTimeoutMs: 1_000,
    });
    const firstAppend = first.append(await acceptedEvent(1, "repository:first-project"));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    let secondSettled = false;
    const secondAppend = second
      .append(await acceptedEvent(2, "repository:second-project"))
      .finally(() => {
        secondSettled = true;
      });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 75));
    expect(secondSettled).toBeFalse();
    releaseDigest?.();
    expect((await firstAppend).ok).toBeTrue();
    expect((await secondAppend).ok).toBeTrue();

    const restarted = createFileProjectJournal(path, digester);
    expect(await restarted.read("repository:first-project")).toHaveLength(1);
    expect(await restarted.read("repository:second-project")).toHaveLength(1);
  });

  test("reclaims a lock only after its recorded owner process is dead", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const token = "018f2000-0000-4000-8000-000000000099";
    const ownerPath = `${path}.lock.${token}.owner`;
    await writeFile(ownerPath, JSON.stringify({ pid: 999_999, token }));
    await link(ownerPath, `${path}.lock`);

    const journal = createFileProjectJournal(path, digester);
    expect((await journal.append(await acceptedEvent())).ok).toBeTrue();
    expect(await journal.read("repository:durable-fixture")).toHaveLength(1);
  });

  test.each([
    ["after-file-sync", 1],
    ["after-rename", 2],
    ["after-directory-sync", 2],
  ] as const)(
    "retains an idempotently recoverable journal across an interruption at %s",
    async (interruptedPhase, expectedEvents) => {
      directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
      const path = join(directory, "project-journal.json");
      const initial = createFileProjectJournal(path, digester);
      expect((await initial.append(await acceptedEvent(1))).ok).toBeTrue();
      const faulting = createFileProjectJournal(path, digester, {
        commitFault: (phase: FileJournalCommitPhase) => {
          if (phase === interruptedPhase) throw new Error(`interrupted:${phase}`);
        },
      });
      const secondEvent = await acceptedEvent(2);
      await expect(faulting.append(secondEvent)).rejects.toThrow(`interrupted:${interruptedPhase}`);

      const restarted = createFileProjectJournal(path, digester);
      expect(await restarted.read("repository:durable-fixture")).toHaveLength(expectedEvents);
      const replay = await restarted.append(secondEvent);
      if (!replay.ok) throw new Error("interrupted append replay failed");
      expect(replay.value.disposition).toBe(expectedEvents === 2 ? "already-present" : "appended");
    },
  );

  test("ignores an interrupted temporary write and retains the last committed document", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const first = createFileProjectJournal(path, digester);
    expect((await first.append(await acceptedEvent())).ok).toBeTrue();
    await writeFile(join(directory, ".project-journal.json.interrupted.tmp"), "{truncated");

    const restarted = createFileProjectJournal(path, digester);
    expect(await restarted.read("repository:durable-fixture")).toHaveLength(1);
  });

  test("fails closed when persisted event content no longer matches its digest", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const first = createFileProjectJournal(path, digester);
    expect((await first.append(await acceptedEvent())).ok).toBeTrue();
    const document = JSON.parse(await readFile(path, "utf8")) as {
      events: { payload: unknown }[];
    };
    document.events[0]!.payload = { fixture: false };
    await writeFile(path, JSON.stringify(document));

    const restarted = createFileProjectJournal(path, digester);
    await expect(restarted.read("repository:durable-fixture")).rejects.toThrow("integrity checks");
  });

  test("fails closed when persisted projects reuse an event identity", async () => {
    directory = await mkdtemp(join(tmpdir(), "aifsd-file-journal-"));
    const path = join(directory, "project-journal.json");
    const first = await acceptedEvent(1, "repository:first-project");
    const conflicting = await acceptedEvent(1, "repository:second-project");
    await writeFile(
      path,
      JSON.stringify({
        events: [first, conflicting],
        protocolVersion: "aifsd.project-journal/1",
      }),
    );

    const restarted = createFileProjectJournal(path, digester);
    await expect(restarted.read("repository:first-project")).rejects.toThrow("integrity checks");
    await expect(restarted.read("repository:second-project")).rejects.toThrow("integrity checks");
  });
});
