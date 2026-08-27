import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  createReservationBoundTaskAuthorityServiceClient,
  createGitProjectRevisionStore,
  createGitTaskDocumentStore,
  createServiceOwnedGitTaskAuthorityService,
  type ProjectReconciliationPolicy,
} from "@geekist/task-graph-authority-compat/node";
import {
  authorisationRequestDigest,
  createTaskAuthorityServiceRegistrationIdentity,
  taskAuthorityServiceAuthorisationRequestDigest,
  type TaskAuthorityServiceClientV2,
  type WorkspaceObservationReference,
} from "@geekist/task-graph-authority-compat/task-authority";
import {
  coreId,
  externalId,
  type CorrelationId,
  type EventId,
  type EvidenceId,
} from "@geekist/llm-core/contracts";
import { createFileProjectJournal } from "../../packages/aifsd/src/project-semantics/adapters/file-journal/public.js";
import { createRepositoryCorpusAdapter } from "../../packages/aifsd/src/project-semantics/adapters/repository-corpus/public.js";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import type { AdmissionAuthority } from "../../packages/aifsd/src/project-semantics/public.js";
import {
  createQualificationAdmissionAuthority,
  createQualificationEvidenceObservation,
  createQualificationResultObservation,
  loadQualificationReview,
  qualificationImplementationDigest,
  QUALIFICATION_IMPLEMENTATION_PATHS,
  QUALIFICATION_ADMISSION_AUTHORITY_ID,
} from "./qualification-admission.js";
import { createHeadlessWorkbenchRuntime, createProjectAdmissionDecisionClock } from "./runtime.js";
import { createFileNativeTaskIntentStore } from "./file-native-task-intent-store.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new TypeError(`${name} is required`);
  return value;
};

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const git = (repositoryPath: string, arguments_: readonly string[]): string =>
  execFileSync("/usr/bin/git", arguments_, {
    cwd: repositoryPath,
    encoding: "utf8",
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      LANG: "C",
      LC_ALL: "C",
    },
  }).trim();

const expiresAfter = (milliseconds: number): string =>
  new Date(Date.now() + milliseconds).toISOString();

const eventId = (sequence: number): EventId =>
  coreId<EventId>(`018f4000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);

const evidenceId = (sequence: number): EvidenceId =>
  coreId<EvidenceId>(`018f4001-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);

const correlationId = externalId<CorrelationId>("headless-workbench-real-task-qualification");

const repositoryPath = resolve(required("AIFSD_QUALIFICATION_REPOSITORY"));
const authorityRepositoryPath = resolve(required("AIFSD_QUALIFICATION_AUTHORITY_REPOSITORY"));
const manifestPath = resolve(required("AIFSD_QUALIFICATION_MANIFEST"));
const canonicalRef = required("AIFSD_QUALIFICATION_CANONICAL_REF");
const taskKey = required("AIFSD_QUALIFICATION_TASK_KEY");
const taskDocumentPath = required("AIFSD_QUALIFICATION_TASK_PATH");
const journalPath = resolve(required("AIFSD_QUALIFICATION_JOURNAL"));
const taskGraphCommand = resolve(required("AIFSD_QUALIFICATION_TASK_GRAPH_COMMAND"));
const reviewArtifactPath = resolve(required("AIFSD_QUALIFICATION_REVIEW_ARTIFACT"));
const reviewArtifactDigest = required("AIFSD_QUALIFICATION_REVIEW_ARTIFACT_DIGEST");

if (git(repositoryPath, ["rev-parse", "--show-toplevel"]) !== repositoryPath) {
  throw new TypeError("The qualification repository must be its canonical checkout");
}
if (git(authorityRepositoryPath, ["rev-parse", "--is-bare-repository"]) !== "true") {
  throw new TypeError("The qualification authority repository must be bare");
}
const canonicalCommit = git(authorityRepositoryPath, ["rev-parse", canonicalRef]);
const manifestBytes = await readFile(manifestPath);
const manifestDigest = sha256(manifestBytes);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { readonly id?: unknown };
if (typeof manifest.id !== "string" || manifest.id.length === 0) {
  throw new TypeError("The qualification manifest must have an id");
}
const expectedProjectId = `repository:${manifest.id}`;
const implementationDigest = await qualificationImplementationDigest(
  QUALIFICATION_IMPLEMENTATION_PATHS.map((identity) => ({
    identity,
    path: join(repositoryPath, identity),
  })),
);
const review = await loadQualificationReview(reviewArtifactPath, reviewArtifactDigest, {
  canonicalRef,
  implementationDigest,
  manifestDigest,
  projectId: expectedProjectId,
  taskKey,
});
const registration = createTaskAuthorityServiceRegistrationIdentity({
  authoritySetDigest: sha256(`${manifestDigest}:aifsd`),
  canonicalRefIdentity: "aifsd-headless-workbench-proof-v2",
  profile: "service_owned_git",
  projectInstanceId: `tgpi_${sha256([authorityRepositoryPath, canonicalRef].join(":")).slice(
    0,
    32,
  )}` as never,
  projectManifestDigest: manifestDigest,
  projectManifestPath: basename(manifestPath),
  repositoryIdentity: "llm-core-aifsd-composite-authority",
  schemaVersion: 1,
});

const temporaryRoot = await realpath(
  await mkdtemp(join(tmpdir(), "aifsd-real-task-qualification-")),
);
try {
  const taskStore = await createGitTaskDocumentStore({
    canonicalRef,
    projectRegistration: registration,
    repositoryPath: authorityRepositoryPath,
    temporaryRoot: join(temporaryRoot, "task-store"),
  });
  const revisionStore = await createGitProjectRevisionStore({
    canonicalRef,
    canonicalRepositoryPath: authorityRepositoryPath,
    projectRegistration: registration,
    sourceRepositoryIdentity: "llm-core-aifsd-composite-source",
    sourceRepositoryPath: authorityRepositoryPath,
    temporaryRoot: join(temporaryRoot, "revision-store"),
  });
  const workspaceObservation: WorkspaceObservationReference = {
    observedAt: new Date().toISOString(),
    observationId: `aifsd-real-task:${canonicalCommit}`,
    observerIdentity: "aifsd-headless-workbench-service-ref-observer",
    revision: sha256(JSON.stringify({ canonicalCommit, canonicalRef, dirtyPaths: [] })),
    schemaVersion: 1,
  };
  const policy: ProjectReconciliationPolicy = {
    authorities: [
      {
        allowedLifecycleTransitions: [
          { from: "proposed", to: "done" },
          { from: "in_progress", to: "done" },
          { from: "review", to: "done" },
        ],
        architectureVersion: 1,
        authority: "aifsd",
        decisionRoot: "packages/aifsd/docs/final-architecture/decisions",
        governingPaths: [
          "AGENTS.md",
          "README.md",
          "packages/aifsd/README.md",
          "packages/aifsd/docs/final-architecture/README.md",
          "packages/aifsd/docs/final-architecture/COORDINATION.md",
          "packages/aifsd/docs/final-architecture/tasks/README.md",
        ],
        taskRoot: "packages/aifsd/docs/final-architecture/tasks",
      },
    ],
    maximumChangedBytes: 1024 * 1024,
    maximumChangedPaths: 32,
    policyRevision: sha256("aifsd-real-task-qualification-policy-v1"),
    projectInstanceId: registration.projectInstanceId,
    registrationRevision: registration.registrationRevision,
    schemaVersion: 1,
    sourceRepositoryIdentity: "llm-core-aifsd-composite-source",
  };
  const service = await createServiceOwnedGitTaskAuthorityService({
    application: {
      authorisationContext: {
        resolve: async (command) =>
          command.operation === "claim"
            ? { capability: "task:claim", claimFence: null, targetOwner: null }
            : command.operation === "delegate"
              ? {
                  capability: "task:delegate",
                  claimFence: command.claimFence,
                  targetOwner: command.targetOwner,
                }
              : { capability: "task:release", claimFence: null, targetOwner: null },
      },
      authoriser: {
        authorise: async (request) => ({
          allowed: request.operation === "claim" || request.operation === "delegate",
          decisionReference: "aifsd-host/service-policy/v1",
          expiresAt: expiresAfter(10 * 60 * 1000),
          policyRevision: "aifsd-host/service-policy/v1",
          requestDigest: taskAuthorityServiceAuthorisationRequestDigest(request),
        }),
      },
      gitTaskState: {
        resolve: async (snapshot, selectedTaskKey) => {
          const task = await snapshot.validateTask(selectedTaskKey, taskDocumentPath);
          return {
            canonicalRefIdentity: registration.canonicalRefIdentity,
            commit: snapshot.head.commit,
            repositoryIdentity: registration.repositoryIdentity,
            targetBlob: task.targetBlob,
            tree: snapshot.head.tree,
          };
        },
      },
      workspaceObserver: {
        observe: async () => ({
          aliases: [],
          available: true,
          dirtyPaths: [],
          epoch: 1,
          reference: workspaceObservation,
          sourceRevision: canonicalCommit,
        }),
      },
    },
    authority: {
      admissionState: {
        snapshot: async () => ({
          dirtyPaths: [],
          scopeAliases: [],
          unavailableAuthorities: [],
          unavailableReadingSources: [],
        }),
      },
      authoriser: {
        authorise: async (request) => ({
          allowed: true,
          decisionReference: "aifsd-host/native-policy/v1",
          expiresAt: expiresAfter(10 * 60 * 1000),
          policyRevision: "aifsd-host/native-policy/v1",
          requestDigest: authorisationRequestDigest(request),
        }),
      },
      evidenceVerifier: { verify: async () => [] },
      finalEffectFence: {
        prepare: async () => ({
          assertCurrent: () => undefined,
          refresh: async () => undefined,
          workspaceObservation,
        }),
      },
      journalRoot: join(temporaryRoot, "authority-journal"),
    },
    governance: {
      approvalVerifier: {
        verify: async (request) => ({
          approvalDigest: request.requestDigest,
          approvalReference: "aifsd-host/review-approved",
          approved: true,
          expiresAt: expiresAfter(10 * 60 * 1000),
          policyRevision: policy.policyRevision,
          sourceCommit: request.sourceRevision.commit,
          sourceRepositoryIdentity: request.sourceRevision.repositoryIdentity,
        }),
      },
      authoriser: {
        authorise: async (request) => ({
          allowed: true,
          decisionReference: "aifsd-host/governance-policy/v1",
          expiresAt: expiresAfter(10 * 60 * 1000),
          policyRevision: policy.policyRevision,
          requestDigest: request.requestDigest,
        }),
        authoriseLifecycle: async (request) => ({
          allowed: true,
          decisionReference: "aifsd-host/lifecycle-policy/v1",
          expiresAt: expiresAfter(10 * 60 * 1000),
          policyRevision: policy.policyRevision,
          requestDigest: request.requestDigest,
        }),
      },
      baseReceiptResolver: { resolve: async () => null },
      journalRoot: join(temporaryRoot, "authority-journal"),
      policy,
      projectionAdapter: {
        project: async (request) => ({
          kind: "bot_proposal",
          projectedCommit: request.authorityHead.commit,
          proposalReference: "aifsd-host/projection-not-requested",
        }),
      },
      stateRoot: join(temporaryRoot, "governance-state"),
      store: revisionStore,
    },
    projectRegistration: registration,
    taskDocumentStore: taskStore,
  });

  const authenticatedAt = new Date().toISOString();
  const authenticatedClient = {
    audience: "aifsd-headless-workbench",
    authenticatedAt,
    authenticationReference: "host-composition/aifsd-real-task-qualification",
    client: { issuer: "codex-host-session", subject: "aifsd-headless-coordinator" },
    expiresAt: expiresAfter(60 * 60 * 1000),
    projectInstanceId: registration.projectInstanceId,
    registrationRevision: registration.registrationRevision,
    schemaVersion: 1 as const,
  };
  const expectedCaller = {
    issuer: "codex-host-session",
    kind: "codex",
    subject: "aifsd-headless-coordinator",
  } as const;
  const taskAuthorityClient: TaskAuthorityServiceClientV2 =
    createReservationBoundTaskAuthorityServiceClient({
      expectedCaller,
      session: {
        assertCaller: async (binding) => ({
          assertionReference: `aifsd-host/assertion/${randomUUID()}`,
          audience: authenticatedClient.audience,
          caller: expectedCaller,
          client: authenticatedClient.client,
          commandDigest: binding.commandDigest,
          expiresAt: expiresAfter(10 * 60 * 1000),
          issuedAt: new Date().toISOString(),
          nonce: randomUUID(),
          operation: binding.operation,
          projectInstanceId: authenticatedClient.projectInstanceId,
          requestDigest: binding.requestDigest,
          schemaVersion: 1,
        }),
        authenticatedClient,
        invoke: async (request, callerAssertion) =>
          await service.application.invoke(request, { authenticatedClient, callerAssertion }),
        projectRegistration: registration,
      },
    });

  const decisionClock = createProjectAdmissionDecisionClock();
  const operationalAdmissionAuthority: AdmissionAuthority = {
    authorityId: QUALIFICATION_ADMISSION_AUTHORITY_ID,
    decide: (request, context) => {
      const observation = request.observation;
      const trustedSource =
        observation.sourceAuthority.kind === "integration" &&
        (observation.sourceAuthority.authorityId === "aifsd-headless-workbench-repository-corpus" ||
          observation.sourceAuthority.authorityId ===
            "aifsd-headless-workbench-task-graph-authority");
      return trustedSource
        ? {
            authority: {
              authorityId: QUALIFICATION_ADMISSION_AUTHORITY_ID,
              kind: "coordinator",
            },
            decidedAt: decisionClock.decidedAt(observation.observedAt, context),
            decisionId: `headless-workbench:${observation.observationId}`,
            policyId: "headless-workbench/real-task-qualification-v1",
          }
        : null;
    },
  };
  const journal = createFileProjectJournal(journalPath, { digest: contentDigest });
  const nativeTaskIntentPath = join(temporaryRoot, "native-task-intents.json");
  const qualificationContext = {
    authorityRevision: () => git(authorityRepositoryPath, ["rev-parse", canonicalRef]),
    correlationId,
    decisionClock,
    evidenceEventId: eventId(4),
    evidenceId: evidenceId(1),
    review,
  };
  const admissionAuthority = createQualificationAdmissionAuthority(
    qualificationContext,
    operationalAdmissionAuthority,
  );
  const createRuntime = () =>
    createHeadlessWorkbenchRuntime({
      admissionAuthority,
      journal: createFileProjectJournal(journalPath, { digest: contentDigest }),
      manifestPath,
      nativeTaskIntents: createFileNativeTaskIntentStore(nativeTaskIntentPath),
      taskAuthorityClient,
      taskGraphCommand: [taskGraphCommand],
    });
  const runtime = await createRuntime();
  const project = await createRepositoryCorpusAdapter().projectId(runtime.source);
  if (!project.ok) throw new Error("The qualification project identity is invalid");
  const projectId = project.value;
  if (projectId !== expectedProjectId) {
    throw new Error("The qualification manifest project identity changed");
  }
  const leaseExpiresAt = expiresAfter(60 * 60 * 1000);
  const nativeInspection = await taskAuthorityClient.inspect(taskKey);
  const context = await runtime.workbench.dispatch({
    correlationId,
    eventId: eventId(1),
    kind: "compileTaskContext",
    operationId: "real-task-context",
    projectId,
    source: runtime.source,
    taskKey,
  });
  if (!context.ok) throw new Error("Real-task context compilation failed");
  const claimRuntime = await createRuntime();
  const claim = await claimRuntime.workbench.dispatch({
    correlationId,
    eventId: eventId(2),
    kind: "claimTask",
    leaseExpiresAt,
    operationId: "real-task-claim",
    projectId,
    taskKey,
  });
  if (!claim.ok) {
    throw new Error(
      `Real-task claim failed: ${JSON.stringify({ diagnostics: claim.diagnostics, nativeInspection })}`,
    );
  }
  const claimNative = claim.value.nativeResult as {
    readonly kind?: unknown;
    readonly receipt?: { readonly claimFence?: unknown };
  };
  const claimFence = claimNative.receipt?.claimFence;
  if (typeof claimFence !== "string") throw new Error("Claim receipt omitted its fence");
  const delegationRuntime = await createRuntime();
  const delegation = await delegationRuntime.workbench.dispatch({
    claimFence,
    correlationId,
    eventId: eventId(3),
    kind: "delegateWork",
    leaseExpiresAt,
    operationId: "real-task-delegation",
    projectId,
    targetOwner: { id: "aifsd-headless-reviewer", kind: "codex" },
    taskKey,
  });
  if (!delegation.ok) throw new Error("Real-task delegation failed");

  const evidenceObservation = createQualificationEvidenceObservation(
    qualificationContext,
    new Date().toISOString(),
  );
  const admissionRuntime = await createRuntime();
  const evidence = await admissionRuntime.workbench.dispatch({
    correlationId,
    eventId: eventId(4),
    kind: "submitEvidence",
    observation: evidenceObservation,
    operationId: "real-task-evidence",
  });
  if (!evidence.ok) throw new Error("Real-task evidence admission failed");
  if (evidence.value.journal === undefined) {
    throw new Error("Real-task evidence receipt omitted its journal event");
  }
  const replayRuntime = await createRuntime();
  const acceptedResult = await replayRuntime.workbench.dispatch({
    correlationId,
    eventId: eventId(5),
    kind: "acceptResult",
    observation: createQualificationResultObservation(
      qualificationContext,
      evidence.value.journal.event,
      new Date().toISOString(),
    ),
    operationId: "real-task-result",
  });
  if (!acceptedResult.ok) throw new Error("Real-task result admission failed");

  console.log(
    JSON.stringify(
      {
        acceptedResult: acceptedResult.value,
        canonicalRef,
        claim: claim.value,
        context: context.value,
        delegation: delegation.value,
        evidence: evidence.value,
        journalCheckpoint: await journal.checkpoint(projectId),
        manifest: { digest: manifestDigest, path: manifestPath },
        nativeInspection,
        projectId,
        projectRegistration: registration,
        review: {
          artifactDigest: review.artifactDigest,
          authorityId: review.artifact.authorityId,
          implementationDigest,
          sourceRef: review.artifact.sourceRef,
        },
        schemaVersion: 1,
        taskDocumentPath,
        taskKey,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
