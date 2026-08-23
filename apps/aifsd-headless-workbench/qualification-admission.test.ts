import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreId, digest, externalId } from "@geekist/llm-core/contracts";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import { createFileProjectJournal } from "../../packages/aifsd/src/project-semantics/adapters/file-journal/public.js";
import type {
  AcceptedProjectEvent,
  AdmissionAuthority,
  AdmissionDecisionContext,
  CorrelationId,
  EventId,
  EvidenceId,
  ProjectEventJournal,
  ProjectObservation,
} from "../../packages/aifsd/src/project-semantics/public.js";
import { createInMemoryProjectJournal } from "../../packages/aifsd/src/project-semantics/public.js";
import {
  createQualificationAdmissionAuthority,
  createQualificationEvidenceObservation,
  createQualificationResultObservation,
  loadQualificationReview,
  qualificationImplementationDigest,
  QUALIFICATION_IMPLEMENTATION_PATHS,
  QUALIFICATION_ADMISSION_AUTHORITY_ID,
  type LoadedQualificationReview,
  type QualificationAdmissionContext,
  type QualificationReviewArtifact,
} from "./qualification-admission.js";
import { createProjectAdmissionDecisionClock } from "./runtime.js";

const eventId = (sequence: number): EventId =>
  coreId<EventId>(`018f5000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);

const correlationId = externalId<CorrelationId>("qualification-admission-test");
const evidenceId = coreId<EvidenceId>("018f5001-0000-7000-8000-000000000001");
const decisionContext: AdmissionDecisionContext = { currentEvents: [], latestAdmittedAt: null };

const artifact: QualificationReviewArtifact = {
  authorityId: "codex-independent-review/raman",
  canonicalRef: "refs/task-graph/authority/proof-v2",
  gates: [
    {
      command: "bun run release:check",
      name: "aifsd-release-check",
      outputDigest: "a".repeat(64),
      result: "passed",
    },
    {
      command: "bun run check",
      name: "app-check",
      outputDigest: "b".repeat(64),
      result: "passed",
    },
    {
      command: "git diff --check",
      name: "workspace-diff-check",
      outputDigest: "c".repeat(64),
      result: "passed",
    },
  ],
  implementationDigest: "c".repeat(64),
  manifestDigest: "d".repeat(64),
  projectId: "repository:llm-core",
  reviewedAt: "2026-08-22T16:00:00.000Z",
  schemaVersion: 1,
  sourceRef: "codex-review:/root/headless_workbench_review/final",
  taskKey: "aifsd/headless-project-workbench-vertical-slice",
  verdict: "accepted",
};

const review: LoadedQualificationReview = {
  artifact,
  artifactDigest: digest("a".repeat(64)),
};

const fixture = (
  journal: ProjectEventJournal = createInMemoryProjectJournal({ digest: contentDigest }),
) => {
  const context: QualificationAdmissionContext = {
    authorityRevision: () => "e".repeat(40),
    correlationId,
    decisionClock: createProjectAdmissionDecisionClock(() =>
      Date.parse("2026-08-22T16:01:00.000Z"),
    ),
    evidenceEventId: eventId(4),
    evidenceId,
    review,
  };
  const operationalAuthority: AdmissionAuthority = {
    authorityId: QUALIFICATION_ADMISSION_AUTHORITY_ID,
    decide: () => null,
  };
  return {
    authority: createQualificationAdmissionAuthority(context, operationalAuthority),
    context,
    journal,
  };
};

const decide = (
  authority: AdmissionAuthority,
  observation: ProjectObservation,
  id: EventId = eventId(4),
) => authority.decide({ eventId: id, observation }, decisionContext);

describe("real-task qualification admission", () => {
  test("admits exact independent evidence and only its causally bound accepted result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-qualification-transaction-"));
    try {
      const journal = createFileProjectJournal(join(directory, "journal.json"), {
        digest: contentDigest,
      });
      const { authority, context } = fixture(journal);
      const observation = createQualificationEvidenceObservation(
        context,
        "2026-08-22T16:00:10.000Z",
      );
      const admitted = await journal.admit({ eventId: eventId(4), observation }, authority);
      expect(admitted.ok).toBeTrue();
      if (!admitted.ok) return;

      const result = createQualificationResultObservation(
        context,
        admitted.value.event,
        "2026-08-22T16:00:20.000Z",
      );
      const accepted = await Promise.race([
        journal.admit({ eventId: eventId(5), observation: result }, authority),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("result admission timed out")), 1_000),
        ),
      ]);
      expect(accepted.ok).toBeTrue();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("denies substituted evidence authority, task, revision, source and gate claims", async () => {
    const { authority, context } = fixture();
    const observation = createQualificationEvidenceObservation(context, "2026-08-22T16:00:10.000Z");
    const payload = observation.payload as Record<string, unknown>;
    const substitutions: readonly ProjectObservation[] = [
      {
        ...observation,
        sourceAuthority: { authorityId: "codex-independent-review/other", kind: "worker" },
      },
      {
        ...observation,
        payload: { ...payload, taskKey: "aifsd/unrelated-task" } as never,
      },
      {
        ...observation,
        provenance: { ...observation.provenance, revision: "f".repeat(40) },
      },
      {
        ...observation,
        provenance: { ...observation.provenance, sourceKind: "integration" },
      },
      {
        ...observation,
        payload: {
          ...payload,
          gates: [{ ...artifact.gates[0], result: "failed" }],
        } as never,
      },
    ];
    for (const substituted of substitutions) {
      expect(await decide(authority, substituted)).toBeNull();
    }
  });

  test("denies accepted results for missing or unrelated evidence events", async () => {
    const { authority, context } = fixture();
    const unrelated = {
      eventId: eventId(4),
      eventDigest: digest("f".repeat(64)),
    } as AcceptedProjectEvent;
    const result = createQualificationResultObservation(
      context,
      unrelated,
      "2026-08-22T16:00:20.000Z",
    );
    expect(
      await authority.decide(
        { eventId: eventId(5), observation: result },
        { currentEvents: [unrelated], latestAdmittedAt: null },
      ),
    ).toBeNull();

    const missingReference = {
      ...result,
      causationId: eventId(3),
      payload: { ...(result.payload as Record<string, unknown>), evidenceEventId: eventId(3) },
    } as ProjectObservation;
    expect(await decide(authority, missingReference, eventId(5))).toBeNull();
  });

  test("loads only the exact digest-bound review artefact and qualification context", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-qualification-review-"));
    const path = join(directory, "review.json");
    try {
      const bytes = JSON.stringify(artifact);
      const artifactDigest = createHash("sha256").update(bytes).digest("hex");
      await writeFile(path, bytes, "utf8");
      const expected = {
        canonicalRef: artifact.canonicalRef,
        implementationDigest: artifact.implementationDigest,
        manifestDigest: artifact.manifestDigest,
        projectId: artifact.projectId,
        taskKey: artifact.taskKey,
      };
      expect((await loadQualificationReview(path, artifactDigest, expected)).artifact).toEqual(
        artifact,
      );
      await expect(loadQualificationReview(path, "0".repeat(64), expected)).rejects.toThrow(
        "digest does not match",
      );
      await expect(
        loadQualificationReview(path, artifactDigest, { ...expected, taskKey: "aifsd/other" }),
      ).rejects.toThrow("does not bind");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("invalidates qualification evidence when any critical owned input changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-qualification-inputs-"));
    const runtimePath = join(directory, "runtime.ts");
    const authorityPath = join(directory, "native-task-authority.ts");
    try {
      await writeFile(runtimePath, "runtime-v1", "utf8");
      await writeFile(authorityPath, "authority-v1", "utf8");
      const inputs = [
        { identity: "apps/workbench/runtime.ts", path: runtimePath },
        { identity: "packages/aifsd/native-task-authority.ts", path: authorityPath },
      ];
      const acceptedDigest = await qualificationImplementationDigest(inputs);
      await writeFile(authorityPath, "authority-v2", "utf8");
      expect(await qualificationImplementationDigest(inputs)).not.toBe(acceptedDigest);
      await writeFile(authorityPath, "authority-v1", "utf8");
      await writeFile(runtimePath, "runtime-v2", "utf8");
      expect(await qualificationImplementationDigest(inputs)).not.toBe(acceptedDigest);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("binds every reviewed critical module and Task Graph package identity", async () => {
    const expected = [
      "apps/aifsd-headless-workbench/file-native-task-intent-store.ts",
      "apps/aifsd-headless-workbench/qualification-admission.ts",
      "apps/aifsd-headless-workbench/real-task-qualification.ts",
      "apps/aifsd-headless-workbench/runtime.ts",
      "bun.lock",
      "node_modules/@geekist/task-graph/package.json",
      "packages/aifsd/package.json",
      "packages/aifsd/src/adapters/atomic-document-file.ts",
      "packages/aifsd/src/application/headless-workbench/public.ts",
      "packages/aifsd/src/application/headless-workbench/status-projection.ts",
      "packages/aifsd/src/application/headless-workbench/workbench.ts",
      "packages/aifsd/src/application/project/project-control-plane.ts",
      "packages/aifsd/src/application/project/public.ts",
      "packages/aifsd/src/config/content-digest.ts",
      "packages/aifsd/src/project-semantics/adapters/file-journal/public.ts",
      "packages/aifsd/src/project-semantics/adapters/native-task-authority/intent-store.ts",
      "packages/aifsd/src/project-semantics/adapters/native-task-authority/public.ts",
      "packages/aifsd/src/project-semantics/adapters/repository-corpus/observations.ts",
      "packages/aifsd/src/project-semantics/adapters/repository-corpus/public.ts",
      "packages/aifsd/src/project-semantics/adapters/repository-corpus/task-graph.ts",
      "packages/aifsd/src/project-semantics/admission.ts",
      "packages/aifsd/src/project-semantics/assertions.ts",
      "packages/aifsd/src/project-semantics/contract.ts",
      "packages/aifsd/src/project-semantics/derived-state.ts",
      "packages/aifsd/src/project-semantics/identity.ts",
      "packages/aifsd/src/project-semantics/journal.ts",
      "packages/aifsd/src/project-semantics/projection.ts",
      "packages/aifsd/src/project-semantics/public.ts",
      "packages/aifsd/src/project-semantics/validation.ts",
    ];
    expect(new Set(QUALIFICATION_IMPLEMENTATION_PATHS).size).toBe(
      QUALIFICATION_IMPLEMENTATION_PATHS.length,
    );
    const reviewedPaths: ReadonlySet<string> = new Set(QUALIFICATION_IMPLEMENTATION_PATHS);
    for (const path of expected) expect(reviewedPaths.has(path)).toBe(true);
    expect(
      await qualificationImplementationDigest(
        QUALIFICATION_IMPLEMENTATION_PATHS.map((identity) => ({ identity, path: identity })),
      ),
    ).toMatch(/^[a-f0-9]{64}$/u);
  });
});
