import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { externalId, type CorrelationId, type EventId } from "@geekist/llm-core/contracts";
import type {
  NativeTaskAuthorityCommand,
  TaskAuthorityServiceClientV2,
} from "@geekist/task-graph/task-authority";
import {
  createNativeTaskAuthorityReceiptV2,
  createTaskAuthorityServiceRegistrationIdentity,
  createTaskAuthorityServiceReservationIdentity,
  taskAuthorityServiceCommandDigest,
  type NativeTaskAuthorityReceiptV2,
} from "@geekist/task-graph/task-authority/service-contract";
import type { Neo4jProjectionAdapter } from "../../packages/aifsd/src/integrations/neo4j/public.js";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import { createFileProjectJournal } from "../../packages/aifsd/src/project-semantics/adapters/file-journal/public.js";
import { admissionRequest } from "../../packages/aifsd/tests/project-semantics/fixtures/project.js";
import type {
  AdmissionAuthority,
  ProjectEventJournal,
} from "../../packages/aifsd/src/project-semantics/public.js";
import { createFileNativeTaskIntentStore } from "./file-native-task-intent-store.js";
import {
  createHeadlessWorkbenchProjectionStore,
  createHeadlessWorkbenchRuntime,
  createProjectAdmissionDecisionClock,
} from "./runtime.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryManifestPath = join(repositoryRoot, "task-graph.project.json");

const neo4jAdapter = (overrides: Record<string, unknown> = {}): Neo4jProjectionAdapter =>
  ({
    identity: {
      migrationId: "migration-current",
      schemaId: "schema-current",
    },
    read: async () => ({
      ok: true,
      value: {
        assertions: [],
        authorised: true,
        checkpoint: {
          journalDigest: { algorithm: "sha256", value: "0".repeat(64) },
          lastEventId: null,
          position: 0,
          projectId: "repository:fixture",
        },
        migrationId: "migration-current",
        projectId: "repository:fixture",
        projectionDigest: { algorithm: "sha256", value: "1".repeat(64) },
        protocolVersion: "aifsd.project-projection/1",
        relationships: [],
        schemaId: "schema-current",
        tasks: [],
        ...overrides,
      },
    }),
  }) as unknown as Neo4jProjectionAdapter;

const taskAuthorityClient = async (
  projectManifestPath: string,
  projectManifestDigest?: string,
): Promise<TaskAuthorityServiceClientV2> => {
  const manifestPath = repositoryManifestPath;
  const registration = createTaskAuthorityServiceRegistrationIdentity({
    authoritySetDigest: "a".repeat(64),
    canonicalRefIdentity: "canonical-main",
    profile: "service_owned_git",
    projectInstanceId: "tgpi_0123456789abcdef0123456789abcdef" as never,
    projectManifestDigest:
      projectManifestDigest ??
      createHash("sha256")
        .update(await readFile(manifestPath))
        .digest("hex"),
    projectManifestPath,
    repositoryIdentity: "llm-core",
    schemaVersion: 1,
  });
  const authenticatedClient = {
    audience: "task-authority-service",
    authenticatedAt: "2026-08-22T00:00:00Z",
    authenticationReference: "session/runtime-test",
    client: { issuer: "fixture", subject: "runtime-test" },
    expiresAt: "2026-08-23T00:00:00Z",
    projectInstanceId: registration.projectInstanceId,
    registrationRevision: registration.registrationRevision,
    schemaVersion: 1 as const,
  };
  return {
    authenticatedClient,
    clientContractVersion: 2,
    reservationIdentity: createTaskAuthorityServiceReservationIdentity({
      authenticatedClient,
      caller: { issuer: "fixture", kind: "codex", subject: "runtime-test" },
    }),
    projectRegistration: registration,
  } as unknown as TaskAuthorityServiceClientV2;
};

const durableTaskAuthorityFixture = async () => {
  const manifestDigest = createHash("sha256")
    .update(await readFile(repositoryManifestPath))
    .digest("hex");
  const registration = createTaskAuthorityServiceRegistrationIdentity({
    authoritySetDigest: "a".repeat(64),
    canonicalRefIdentity: "canonical-main",
    profile: "service_owned_git",
    projectInstanceId: "tgpi_0123456789abcdef0123456789abcdef" as never,
    projectManifestDigest: manifestDigest,
    projectManifestPath: "task-graph.project.json",
    repositoryIdentity: "llm-core",
    schemaVersion: 1,
  });
  const authenticatedClient = {
    audience: "task-authority-service",
    authenticatedAt: "2026-08-22T00:00:00Z",
    authenticationReference: "session/runtime-durable-test",
    client: { issuer: "fixture", subject: "runtime-durable-test" },
    expiresAt: "2026-08-24T00:00:00Z",
    projectInstanceId: registration.projectInstanceId,
    registrationRevision: registration.registrationRevision,
    schemaVersion: 1 as const,
  };
  const receipts = new Map<string, NativeTaskAuthorityReceiptV2>();
  const reservations = new Map<
    string,
    { readonly commandDigest: string; readonly receipt: NativeTaskAuthorityReceiptV2 }
  >();
  const commands: NativeTaskAuthorityCommand[] = [];
  let admissionRevision = "2".repeat(64);
  let effects = 0;
  let inspections = 0;
  const gitState = (commit: string, tree: string, blob: string) => ({
    canonicalRefIdentity: registration.canonicalRefIdentity,
    commit: { algorithm: "sha1" as const, digest: commit.repeat(40) },
    repositoryIdentity: registration.repositoryIdentity,
    targetBlob: { algorithm: "sha1" as const, digest: blob.repeat(40) },
    tree: { algorithm: "sha1" as const, digest: tree.repeat(40) },
  });
  const receiptFor = (command: NativeTaskAuthorityCommand): NativeTaskAuthorityReceiptV2 =>
    createNativeTaskAuthorityReceiptV2({
      admissionRevision: command.expectedAdmissionRevision,
      afterRevision: "6".repeat(64),
      authenticatedClient,
      authorisationDecisionReference: "authorisation:runtime-test",
      beforeRevision: "7".repeat(64),
      callerAssertionReference: "caller-assertion:runtime-test",
      claimFence: command.operation === "delegate" ? command.claimFence : "claim-fence-runtime",
      commandDigest: taskAuthorityServiceCommandDigest(command),
      commandId: command.commandId,
      completedAt: "2026-08-23T01:00:01Z",
      evidenceDecisionReferences: [],
      evidenceDigests: [],
      gitEffect: { after: gitState("b", "c", "d"), before: gitState("8", "9", "a") },
      operation: command.operation,
      outcome: "applied",
      priorClaimReceiptId: null,
      projectInstanceId: registration.projectInstanceId,
      reason: "applied",
      receiptId: `receipt:${command.commandId}`,
      registrationRevision: registration.registrationRevision,
      reservedAt: "2026-08-23T01:00:00Z",
      schemaVersion: 2,
      taskKey: command.taskKey,
      workspaceObservation: {
        observedAt: "2026-08-23T00:00:00Z",
        observationId: "workspace:runtime-test",
        observerIdentity: "observer:runtime-test",
        revision: "5".repeat(64),
        schemaVersion: 1,
      },
    });
  const client: TaskAuthorityServiceClientV2 = {
    authenticatedClient,
    clientContractVersion: 2,
    projectRegistration: registration,
    getAuthorityHead: async () => ({
      canonicalRefIdentity: registration.canonicalRefIdentity,
      commit: { algorithm: "sha1", digest: "b".repeat(40) },
      projectInstanceId: registration.projectInstanceId,
      registrationRevision: registration.registrationRevision,
      repositoryIdentity: registration.repositoryIdentity,
      schemaVersion: 1,
      tree: { algorithm: "sha1", digest: "c".repeat(40) },
    }),
    getReceipt: async (receiptId) => receipts.get(receiptId) ?? null,
    inspect: async (taskKey) => {
      inspections += 1;
      return {
        admission: {
          nativeAdmission: { targetRevision: "1".repeat(64) },
          revision: admissionRevision,
          taskKey,
        },
      } as Awaited<ReturnType<TaskAuthorityServiceClientV2["inspect"]>>;
    },
    execute: async (command) => {
      commands.push(command);
      const commandDigest = taskAuthorityServiceCommandDigest(command);
      const prior = reservations.get(command.commandId);
      if (prior !== undefined) {
        return prior.commandDigest === commandDigest
          ? { kind: "receipt", receipt: prior.receipt, replayed: true }
          : {
              code: "idempotency_conflict",
              kind: "rejected",
              message: "conflicting durable command",
              receiptId: prior.receipt.receiptId,
            };
      }
      const receipt = receiptFor(command);
      effects += 1;
      reservations.set(command.commandId, { commandDigest, receipt });
      receipts.set(receipt.receiptId, receipt);
      return { kind: "receipt", receipt, replayed: false };
    },
    reservationIdentity: createTaskAuthorityServiceReservationIdentity({
      authenticatedClient,
      caller: { issuer: "fixture", kind: "codex", subject: "runtime-durable-test" },
    }),
  };
  return {
    client,
    commands,
    effects: () => effects,
    inspections: () => inspections,
    setAdmissionRevision: (value: string) => {
      admissionRevision = value;
    },
  };
};

const acceptingAuthority = (): AdmissionAuthority => ({
  authorityId: "runtime-native-admission",
  decide: (request) => ({
    authority: { authorityId: "runtime-native-admission", kind: "coordinator" as const },
    decidedAt: request.observation.observedAt,
    decisionId: `runtime:${request.observation.observationId}`,
    policyId: "runtime-native-admission/v1",
  }),
});

const claimOperation = () => ({
  correlationId: externalId<CorrelationId>("runtime-native-replay"),
  eventId: "018f5000-0000-7000-8000-000000000002" as EventId,
  kind: "claimTask" as const,
  leaseExpiresAt: "2026-08-24T01:00:00Z",
  operationId: "runtime-native-replay-1",
  projectId: "repository:llm-core",
  taskKey: "aifsd/headless-project-workbench-vertical-slice",
});

describe("headless workbench runtime composition", () => {
  test("binds the configured manifest and explicit admission authority", async () => {
    const manifestPath = repositoryManifestPath;
    const runtime = await createHeadlessWorkbenchRuntime({
      admissionAuthority: {
        authorityId: "runtime-test-admission",
        decide: () => null,
      },
      manifestPath,
    });

    expect(runtime.source.manifestPath).toBe(manifestPath);
    expect(runtime.source.taskGraphCommand).toEqual([
      join(repositoryRoot, "node_modules", ".bin", "task-graph"),
    ]);
    expect(runtime.workbench.dispatch).toBeFunction();
  });

  test("rejects an unauthorised Neo4j snapshot instead of treating it as fresh", async () => {
    const store = createHeadlessWorkbenchProjectionStore(neo4jAdapter({ authorised: false }));
    await expect(store.read("repository:fixture")).rejects.toThrow("authorisation");
  });

  test.each([
    { projectId: "repository:foreign" },
    { schemaId: "schema-stale" },
    { migrationId: "migration-stale" },
  ])("rejects incompatible Neo4j identity metadata", async (overrides) => {
    const store = createHeadlessWorkbenchProjectionStore(neo4jAdapter(overrides));
    await expect(store.read("repository:fixture")).rejects.toThrow("identity");
  });

  test("rejects a Task Graph client registered for another manifest", async () => {
    const manifestPath = repositoryManifestPath;
    await expect(
      createHeadlessWorkbenchRuntime({
        admissionAuthority: { authorityId: "runtime-test-admission", decide: () => null },
        manifestPath,
        taskAuthorityClient: await taskAuthorityClient("foreign-task-graph.project.json"),
      }),
    ).rejects.toThrow("does not bind");
  });

  test("rejects a same-path Task Graph registration with a stale manifest digest", async () => {
    const manifestPath = repositoryManifestPath;
    await expect(
      createHeadlessWorkbenchRuntime({
        admissionAuthority: { authorityId: "runtime-test-admission", decide: () => null },
        manifestPath,
        taskAuthorityClient: await taskAuthorityClient("task-graph.project.json", "f".repeat(64)),
      }),
    ).rejects.toThrow("does not bind");
  });

  test("fails closed when Task Graph mutation is composed without a durable intent store", async () => {
    await expect(
      createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        manifestPath: repositoryManifestPath,
        taskAuthorityClient: (await durableTaskAuthorityFixture()).client,
      }),
    ).rejects.toThrow("durable native intent store");
  });

  test("replays across full runtime recomposition with mutation execution uncomposed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-runtime-native-replay-"));
    try {
      const journalPath = join(directory, "journal.json");
      const intentPath = join(directory, "native-intents.json");
      const taskAuthority = await durableTaskAuthorityFixture();
      const first = await createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        journal: createFileProjectJournal(journalPath, { digest: contentDigest }),
        manifestPath: repositoryManifestPath,
        nativeTaskIntents: createFileNativeTaskIntentStore(intentPath),
        taskAuthorityClient: taskAuthority.client,
      });
      const operation = claimOperation();
      const admitted = await first.workbench.dispatch(operation);
      if (!admitted.ok || admitted.value.journal === undefined) {
        throw new Error("initial native execution failed");
      }

      const restarted = await createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        journal: createFileProjectJournal(journalPath, { digest: contentDigest }),
        manifestPath: repositoryManifestPath,
        nativeTaskIntents: createFileNativeTaskIntentStore(intentPath),
        taskAuthorityClient: taskAuthority.client,
        taskAuthorityExecution: "receipt-only",
      });
      const replay = await restarted.workbench.dispatch(operation);
      if (!replay.ok || replay.value.journal === undefined) {
        throw new Error("executor-absent native replay failed");
      }
      expect(replay.value.journal.appendDisposition).toBe("already-present");
      expect(replay.value.journal.event).toEqual(admitted.value.journal.event);
      expect(taskAuthority.commands).toHaveLength(1);
      expect(taskAuthority.effects()).toBe(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("recovers an effect-before-append crash from the exact durable intent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-runtime-native-crash-"));
    try {
      const journalPath = join(directory, "journal.json");
      const intentPath = join(directory, "native-intents.json");
      const taskAuthority = await durableTaskAuthorityFixture();
      const durableJournal = createFileProjectJournal(journalPath, { digest: contentDigest });
      let injectFault = true;
      const faultingJournal: ProjectEventJournal = {
        ...durableJournal,
        admit: async (request, authority) => {
          if (
            injectFault &&
            request.observation.sourceAuthority.authorityId ===
              "aifsd-headless-workbench-task-graph-authority"
          ) {
            injectFault = false;
            throw new Error("fault after native receipt before AIFSD append");
          }
          return durableJournal.admit(request, authority);
        },
      };
      const first = await createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        journal: faultingJournal,
        manifestPath: repositoryManifestPath,
        nativeTaskIntents: createFileNativeTaskIntentStore(intentPath),
        taskAuthorityClient: taskAuthority.client,
      });
      const operation = claimOperation();
      await expect(first.workbench.dispatch(operation)).rejects.toThrow("before AIFSD append");
      expect(await durableJournal.read(operation.projectId)).toEqual([]);
      expect(taskAuthority.effects()).toBe(1);
      expect(taskAuthority.inspections()).toBe(1);

      taskAuthority.setAdmissionRevision("f".repeat(64));
      const foreignClient: TaskAuthorityServiceClientV2 = {
        ...taskAuthority.client,
        reservationIdentity: createTaskAuthorityServiceReservationIdentity({
          authenticatedClient: taskAuthority.client.authenticatedClient,
          caller: {
            ...taskAuthority.client.reservationIdentity.caller,
            subject: "foreign-runtime",
          },
        }),
      };
      const foreignRestart = await createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        journal: createFileProjectJournal(journalPath, { digest: contentDigest }),
        manifestPath: repositoryManifestPath,
        nativeTaskIntents: createFileNativeTaskIntentStore(intentPath),
        taskAuthorityClient: foreignClient,
      });
      expect(await foreignRestart.workbench.dispatch(operation)).toEqual({
        ok: false,
        diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
      });
      expect(taskAuthority.commands).toHaveLength(1);
      expect(taskAuthority.effects()).toBe(1);

      const restarted = await createHeadlessWorkbenchRuntime({
        admissionAuthority: acceptingAuthority(),
        journal: createFileProjectJournal(journalPath, { digest: contentDigest }),
        manifestPath: repositoryManifestPath,
        nativeTaskIntents: createFileNativeTaskIntentStore(intentPath),
        taskAuthorityClient: taskAuthority.client,
      });
      const recovered = await restarted.workbench.dispatch(operation);
      expect(recovered.ok).toBeTrue();
      expect(taskAuthority.effects()).toBe(1);
      expect(taskAuthority.inspections()).toBe(1);
      expect(taskAuthority.commands).toHaveLength(2);
      expect(taskAuthorityServiceCommandDigest(taskAuthority.commands[1]!)).toBe(
        taskAuthorityServiceCommandDigest(taskAuthority.commands[0]!),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("allocates non-regressing admission time atomically across writers and restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aifsd-admission-clock-"));
    try {
      const path = join(directory, "journal.json");
      const digester = { digest: contentDigest };
      const firstJournal = createFileProjectJournal(path, digester, { lockRetryMs: 5 });
      const secondJournal = createFileProjectJournal(path, digester, { lockRetryMs: 5 });
      const firstClock = createProjectAdmissionDecisionClock(() =>
        Date.parse("2026-08-22T00:00:20Z"),
      );
      const secondClock = createProjectAdmissionDecisionClock(() =>
        Date.parse("2026-08-22T00:00:10Z"),
      );
      let signalAllocated: (() => void) | undefined;
      const allocated = new Promise<void>((resolveAllocated) => {
        signalAllocated = resolveAllocated;
      });
      let releaseFirst: (() => void) | undefined;
      const holdFirst = new Promise<void>((resolveFirst) => {
        releaseFirst = resolveFirst;
      });
      const authorityId = "atomic-admission-authority";
      const first = firstJournal.admit(admissionRequest(1, "observation.accepted", {}), {
        authorityId,
        decide: async (request, context) => {
          const decidedAt = firstClock.decidedAt(request.observation.observedAt, context);
          signalAllocated?.();
          await holdFirst;
          return {
            authority: { authorityId, kind: "coordinator" },
            decidedAt,
            decisionId: "atomic-admission-1",
            policyId: "atomic-admission/v1",
          };
        },
      });
      await allocated;
      const second = secondJournal.admit(admissionRequest(2, "observation.accepted", {}), {
        authorityId,
        decide: (request, context) => ({
          authority: { authorityId, kind: "coordinator" },
          decidedAt: secondClock.decidedAt(request.observation.observedAt, context),
          decisionId: "atomic-admission-2",
          policyId: "atomic-admission/v1",
        }),
      });
      releaseFirst?.();
      expect((await first).ok).toBeTrue();
      expect((await second).ok).toBeTrue();

      const restarted = createFileProjectJournal(path, digester);
      const restartClock = createProjectAdmissionDecisionClock(() =>
        Date.parse("2026-08-22T00:00:05Z"),
      );
      expect(
        (
          await restarted.admit(admissionRequest(3, "observation.accepted", {}), {
            authorityId,
            decide: (request, context) => ({
              authority: { authorityId, kind: "coordinator" },
              decidedAt: restartClock.decidedAt(request.observation.observedAt, context),
              decisionId: "atomic-admission-3",
              policyId: "atomic-admission/v1",
            }),
          })
        ).ok,
      ).toBeTrue();
      expect(
        (await restarted.read("project-semantic-characterization")).map(
          ({ admittedAt }) => admittedAt,
        ),
      ).toEqual([
        "2026-08-22T00:00:20.000Z",
        "2026-08-22T00:00:20.000Z",
        "2026-08-22T00:00:20.000Z",
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
