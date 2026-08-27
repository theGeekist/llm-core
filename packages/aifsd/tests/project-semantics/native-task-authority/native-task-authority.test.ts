import { describe, expect, test } from "bun:test";
import {
  coreId,
  externalId,
  type CorrelationId,
  type EventId,
  type EvidenceId,
} from "@geekist/llm-core/contracts";
import type {
  NativeTaskAuthorityCommand,
  TaskAuthorityServiceClientV2,
} from "@geekist/task-graph-authority-compat/task-authority";
import {
  createNativeTaskAuthorityReceiptV2,
  createTaskAuthorityServiceReservationIdentity,
  createTaskAuthorityServiceRegistrationIdentity,
  taskAuthorityServiceCommandDigest,
  validateProjectInstanceId,
  type NativeTaskAuthorityReceiptV2,
} from "@geekist/task-graph-authority-compat/task-authority/service-contract";
import type { NativeTaskOperation } from "../../../src/application/headless-workbench/public.js";
import { createTaskGraphNativeTaskAuthority } from "../../../src/project-semantics/adapters/native-task-authority/public.js";

const taskRevision = "1".repeat(64);
const admissionRevision = "2".repeat(64);
const eventId = coreId<EventId>("018f3000-0000-7000-8000-000000000001");
const evidenceId = coreId<EvidenceId>("018f3000-0000-7000-8000-000000000002");
const projectRegistration = createTaskAuthorityServiceRegistrationIdentity({
  authoritySetDigest: "3".repeat(64),
  canonicalRefIdentity: "git-ref:main",
  profile: "service_owned_git",
  projectInstanceId: validateProjectInstanceId(`tgpi_${"a".repeat(32)}`),
  projectManifestDigest: "4".repeat(64),
  projectManifestPath: "task-graph.project.json",
  repositoryIdentity: "repository:fixture",
  schemaVersion: 1,
});
const authenticatedClient = {
  audience: "task-authority-service",
  authenticatedAt: "2026-08-22T00:00:00Z",
  authenticationReference: "auth:fixture",
  client: { issuer: "fixture", subject: "aifsd" },
  expiresAt: "2026-08-23T00:00:00Z",
  projectInstanceId: projectRegistration.projectInstanceId,
  registrationRevision: projectRegistration.registrationRevision,
  schemaVersion: 1 as const,
};
const trustedCaller = {
  issuer: "fixture",
  kind: "codex",
  subject: "aifsd",
} as const;
const reservationIdentity = createTaskAuthorityServiceReservationIdentity({
  authenticatedClient,
  caller: trustedCaller,
});
const workspaceObservation = {
  observedAt: "2026-08-22T00:00:00Z",
  observationId: "workspace:fixture",
  observerIdentity: "observer:fixture",
  revision: "5".repeat(64),
  schemaVersion: 1 as const,
};

const gitTaskState = (commit: string, tree: string, targetBlob: string) => ({
  canonicalRefIdentity: projectRegistration.canonicalRefIdentity,
  commit: { algorithm: "sha1" as const, digest: commit.repeat(40) },
  repositoryIdentity: projectRegistration.repositoryIdentity,
  targetBlob: { algorithm: "sha1" as const, digest: targetBlob.repeat(40) },
  tree: { algorithm: "sha1" as const, digest: tree.repeat(40) },
});

const receiptFor = (
  command: NativeTaskAuthorityCommand,
  receiptId = `receipt:${command.commandId}`,
): NativeTaskAuthorityReceiptV2 =>
  createNativeTaskAuthorityReceiptV2({
    admissionRevision: command.expectedAdmissionRevision,
    afterRevision: "6".repeat(64),
    authenticatedClient,
    authorisationDecisionReference: "authorisation:fixture",
    beforeRevision: "7".repeat(64),
    callerAssertionReference: "caller-assertion:fixture",
    claimFence: command.operation === "delegate" ? command.claimFence : null,
    commandDigest: taskAuthorityServiceCommandDigest(command),
    commandId: command.commandId,
    completedAt: "2026-08-22T01:00:01Z",
    evidenceDecisionReferences: [],
    evidenceDigests: [],
    gitEffect: {
      after: gitTaskState("b", "c", "d"),
      before: gitTaskState("8", "9", "a"),
    },
    operation: command.operation,
    outcome: "applied",
    priorClaimReceiptId: null,
    projectInstanceId: projectRegistration.projectInstanceId,
    reason: "applied",
    receiptId,
    registrationRevision: projectRegistration.registrationRevision,
    reservedAt: "2026-08-22T01:00:00Z",
    schemaVersion: 2,
    taskKey: command.taskKey,
    workspaceObservation,
  });

const clientFixture = () => {
  let appliedEffects = 0;
  const commands: NativeTaskAuthorityCommand[] = [];
  const receipts = new Map<string, NativeTaskAuthorityReceiptV2>();
  const reservations = new Map<
    string,
    { readonly commandDigest: string; readonly receipt: NativeTaskAuthorityReceiptV2 }
  >();
  const client: TaskAuthorityServiceClientV2 = {
    authenticatedClient,
    clientContractVersion: 2,
    projectRegistration,
    reservationIdentity,
    getAuthorityHead: async () => ({
      canonicalRefIdentity: projectRegistration.canonicalRefIdentity,
      commit: { algorithm: "sha1", digest: "b".repeat(40) },
      projectInstanceId: projectRegistration.projectInstanceId,
      registrationRevision: projectRegistration.registrationRevision,
      repositoryIdentity: projectRegistration.repositoryIdentity,
      schemaVersion: 1,
      tree: { algorithm: "sha1", digest: "c".repeat(40) },
    }),
    getReceipt: async (receiptId) => receipts.get(receiptId) ?? null,
    inspect: async (taskKey) =>
      ({
        admission: {
          nativeAdmission: { targetRevision: taskRevision },
          revision: admissionRevision,
          taskKey,
        },
      }) as Awaited<ReturnType<TaskAuthorityServiceClientV2["inspect"]>>,
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
              message: "commandId is reserved for another exact command",
              receiptId: prior.receipt.receiptId,
            };
      }
      const receipt = receiptFor(command);
      appliedEffects += 1;
      reservations.set(command.commandId, { commandDigest, receipt });
      receipts.set(receipt.receiptId, receipt);
      return { kind: "receipt", receipt, replayed: false };
    },
  };
  return { appliedEffects: () => appliedEffects, client, commands, receipts };
};

const authorityFor = (client: TaskAuthorityServiceClientV2) =>
  createTaskGraphNativeTaskAuthority({
    client,
    evidenceId,
    projectId: "repository:fixture",
    sourceAuthority: { authorityId: "task-graph-native-authority", kind: "integration" },
  });

const claimOperation = (): NativeTaskOperation => ({
  correlationId: externalId<CorrelationId>("native-claim"),
  eventId,
  kind: "claimTask",
  leaseExpiresAt: "2026-08-22T02:00:00Z",
  operationId: "native-claim-1",
  projectId: "repository:fixture",
  taskKey: "aifsd/ready",
});

const executePrepared = async (
  authority: ReturnType<typeof authorityFor>,
  operation: NativeTaskOperation,
) => {
  const prepared = await authority.operator.prepare(operation);
  if (!prepared.ok) return { intent: null, result: prepared };
  return {
    intent: prepared.value,
    result: await authority.operator.execute(operation, prepared.value),
  };
};

describe("Task Graph native task authority", () => {
  test("binds a claim and its replay proof to the exact provider registration and command", async () => {
    const fixture = clientFixture();
    const authority = authorityFor(fixture.client);
    const operation = claimOperation();
    const { intent, result } = await executePrepared(authority, operation);

    expect(fixture.commands).toEqual([
      {
        commandId: eventId,
        expectedAdmissionRevision: admissionRevision,
        expectedTaskRevision: taskRevision,
        leaseExpiresAt: "2026-08-22T02:00:00Z",
        operation: "claim",
        schemaVersion: 1,
        taskKey: "aifsd/ready",
      },
    ]);
    if (intent === null || !result.ok) throw new Error("native execution failed");
    expect(result.value.observation).toEqual(
      expect.objectContaining({
        kind: "observation.accepted",
        observationId: `task-authority-receipt:receipt:${eventId}`,
      }),
    );
    expect(await authority.receipts.verify(operation, intent, result.value.observation)).toEqual(
      expect.objectContaining({
        ok: true,
        value: { nativeResult: expect.objectContaining({ kind: "receipt" }) },
      }),
    );
  });

  test("accepts an exact provider idempotent replay only after revalidating its durable receipt", async () => {
    const fixture = clientFixture();
    const authority = authorityFor(fixture.client);
    const operation = claimOperation();
    const prepared = await authority.operator.prepare(operation);
    if (!prepared.ok) throw new Error("native preparation failed");
    const first = await authority.operator.execute(operation, prepared.value);
    const replay = await authority.operator.execute(operation, prepared.value);

    expect(fixture.commands).toHaveLength(2);
    expect(fixture.appliedEffects()).toBe(1);
    expect(first.ok).toBeTrue();
    expect(replay.ok).toBeTrue();
    if (!first.ok || !replay.ok) throw new Error("native replay failed");
    expect(replay.value.observation).toEqual(first.value.observation);
    expect(
      await authority.receipts.verify(operation, prepared.value, replay.value.observation),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        value: { nativeResult: expect.objectContaining({ kind: "receipt" }) },
      }),
    );
  });

  test("rejects a durable exact command reserved by another stable principal", async () => {
    const fixture = clientFixture();
    const operation = claimOperation();
    const firstAuthority = authorityFor(fixture.client);
    const prepared = await firstAuthority.operator.prepare(operation);
    if (!prepared.ok) throw new Error("native preparation failed");

    const foreignClient: TaskAuthorityServiceClientV2 = {
      ...fixture.client,
      reservationIdentity: createTaskAuthorityServiceReservationIdentity({
        authenticatedClient,
        caller: { ...trustedCaller, subject: "foreign-aifsd" },
      }),
    };
    const replay = await authorityFor(foreignClient).operator.execute(operation, prepared.value);

    expect(replay).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
    expect(fixture.commands).toEqual([]);
    expect(fixture.appliedEffects()).toBe(0);
  });

  test("rejects a reused provider command id with substituted command meaning", async () => {
    const fixture = clientFixture();
    const authority = authorityFor(fixture.client);
    const operation = claimOperation();
    expect((await executePrepared(authority, operation)).result.ok).toBeTrue();

    const substitutedOperation = {
      ...operation,
      leaseExpiresAt: "2026-08-22T03:00:00Z",
    };
    const substituted = (await executePrepared(authority, substitutedOperation)).result;
    expect(substituted).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
    expect(fixture.appliedEffects()).toBe(1);
  });

  test("requires the current claim fence and explicit target for delegation", async () => {
    const fixture = clientFixture();
    const authority = authorityFor(fixture.client);
    await executePrepared(authority, {
      claimFence: "claim-fence-1",
      correlationId: externalId<CorrelationId>("native-delegate"),
      eventId,
      kind: "delegateWork",
      leaseExpiresAt: "2026-08-22T03:00:00Z",
      operationId: "native-delegate-1",
      projectId: "repository:fixture",
      targetOwner: { id: "worker-1", kind: "codex" },
      taskKey: "aifsd/ready",
    });
    expect(fixture.commands[0]).toEqual(
      expect.objectContaining({
        claimFence: "claim-fence-1",
        operation: "delegate",
        targetOwner: { id: "worker-1", kind: "codex" },
      }),
    );
  });

  test("fails closed when the durable receipt is absent or substituted", async () => {
    const fixture = clientFixture();
    const authority = authorityFor(fixture.client);
    const operation = claimOperation();
    const { intent, result: executed } = await executePrepared(authority, operation);
    if (intent === null || !executed.ok) throw new Error("native execution failed");
    const receiptId = `receipt:${eventId}`;
    fixture.receipts.delete(receiptId);
    expect(await authority.receipts.verify(operation, intent, executed.value.observation)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });

    fixture.receipts.set(receiptId, receiptFor(fixture.commands[0]!, `${receiptId}:substituted`));
    expect(await authority.receipts.verify(operation, intent, executed.value.observation)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
  });

  test("fails closed when the authenticated client rejects or throws", async () => {
    const fixture = clientFixture();
    fixture.client.execute = async () => {
      throw new Error("transport unavailable");
    };
    const authority = authorityFor(fixture.client);
    const prepared = await authority.operator.prepare(claimOperation());
    if (!prepared.ok) throw new Error("native preparation failed");
    expect(await authority.operator.execute(claimOperation(), prepared.value)).toEqual({
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    });
  });

  test("rejects a foreign AIFSD project before inspecting or mutating Task Graph", async () => {
    const fixture = clientFixture();
    let inspected = false;
    fixture.client.inspect = async () => {
      inspected = true;
      throw new Error("must not inspect");
    };
    const result = await authorityFor(fixture.client).operator.prepare({
      ...claimOperation(),
      projectId: "repository:foreign",
    });

    expect(inspected).toBeFalse();
    expect(fixture.commands).toEqual([]);
    expect(result.ok).toBeFalse();
  });
});
