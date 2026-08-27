import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { coreId, type EvidenceId } from "@geekist/llm-core/contracts";
import type { TaskAuthorityServiceClientV2 } from "@geekist/task-graph-authority-compat/task-authority";
import {
  createTaskAuthorityServiceReservationIdentity,
  taskAuthorityServiceRegistrationDigest,
  taskAuthorityServiceReservationIdentityDigest,
  validateAuthenticatedTaskAuthorityClient,
  validateTaskAuthorityServiceRegistrationIdentity,
  validateTaskAuthorityServiceReservationIdentity,
} from "@geekist/task-graph-authority-compat/task-authority/service-contract";
import {
  createHeadlessWorkbench,
  type HeadlessWorkbench,
  type NativeTaskIntentStore,
} from "../../packages/aifsd/src/application/headless-workbench/public.js";
import {
  createProjectControlPlane,
  type ProjectProjectionStore,
} from "../../packages/aifsd/src/application/project/public.js";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";
import { createTaskGraphNativeTaskAuthority } from "../../packages/aifsd/src/project-semantics/adapters/native-task-authority/public.js";
import {
  createNativeRepositoryCorpusPorts,
  createRepositoryCorpusAdapter,
  type RepositoryCorpusSource,
} from "../../packages/aifsd/src/project-semantics/adapters/repository-corpus/public.js";
import type {
  AdmissionAuthority,
  AdmissionDecisionContext,
  ProjectEventJournal,
  ProjectProjection,
} from "../../packages/aifsd/src/project-semantics/public.js";
import { PROJECT_PROJECTION_PROTOCOL_VERSION } from "../../packages/aifsd/src/project-semantics/public.js";
import { createInMemoryProjectJournal } from "../../packages/aifsd/src/project-semantics/public.js";
import type { Neo4jProjectionAdapter } from "../../packages/aifsd/src/integrations/neo4j/public.js";

export interface HeadlessWorkbenchRuntime {
  readonly source: RepositoryCorpusSource;
  readonly workbench: HeadlessWorkbench;
}

export interface HeadlessWorkbenchRuntimeOptions {
  readonly admissionAuthority: AdmissionAuthority;
  readonly journal?: ProjectEventJournal;
  readonly manifestPath: string;
  readonly nativeTaskIntents?: NativeTaskIntentStore;
  readonly projection?: Neo4jProjectionAdapter;
  readonly taskAuthorityClient?: TaskAuthorityServiceClientV2;
  readonly taskAuthorityExecution?: "enabled" | "receipt-only";
  readonly taskGraphCommand?: readonly string[];
}

const EVIDENCE_UUID_V8_DOMAIN = "aifsd.headless-workbench.evidence-id/1";

/** Deterministic RFC 9562 UUIDv8 using the first 122 bits of domain-separated SHA-256. */
const evidenceUuidV8 = (name: string): EvidenceId => {
  const bytes = createHash("sha256")
    .update(EVIDENCE_UUID_V8_DOMAIN)
    .update("\0")
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return coreId<EvidenceId>(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
};

export interface ProjectAdmissionDecisionClock {
  readonly decidedAt: (observedAt: string, context: AdmissionDecisionContext) => string;
}

export const createProjectAdmissionDecisionClock = (
  now: () => number = Date.now,
): ProjectAdmissionDecisionClock => ({
  decidedAt: (observedAt, context) => {
    const observedTime = Date.parse(observedAt);
    if (!Number.isFinite(observedTime)) throw new TypeError("Observation time is invalid");
    const latestTime =
      context.latestAdmittedAt === null
        ? Number.NEGATIVE_INFINITY
        : Date.parse(context.latestAdmittedAt);
    return new Date(Math.max(now(), observedTime, latestTime)).toISOString();
  },
});

export const createHeadlessWorkbenchProjectionStore = (
  adapter?: Neo4jProjectionAdapter,
): ProjectProjectionStore => {
  if (adapter !== undefined) {
    return {
      read: async (projectId) => {
        const read = await adapter.read(projectId);
        if (!read.ok) {
          if (read.diagnostics.every(({ reasonCode }) => reasonCode === "projection-missing"))
            return null;
          throw new Error("Neo4j projection read failed validation");
        }
        if (
          read.value.authorised !== true ||
          read.value.protocolVersion !== PROJECT_PROJECTION_PROTOCOL_VERSION ||
          read.value.projectId !== projectId ||
          read.value.checkpoint.projectId !== projectId ||
          read.value.schemaId !== adapter.identity.schemaId ||
          read.value.migrationId !== adapter.identity.migrationId
        ) {
          throw new Error("Neo4j projection identity or authorisation is invalid");
        }
        return {
          assertions: read.value.assertions,
          checkpoint: read.value.checkpoint,
          projectId: read.value.projectId,
          projectionDigest: read.value.projectionDigest,
          protocolVersion: PROJECT_PROJECTION_PROTOCOL_VERSION,
          tasks: read.value.tasks,
        };
      },
      replace: async (projection) => {
        const projected = await adapter.project(projection);
        if (!projected.ok) throw new Error("Neo4j rejected the project projection");
      },
    };
  }
  const projections = new Map<string, ProjectProjection>();
  return {
    read: async (projectId) => projections.get(projectId) ?? null,
    replace: async (projection) => {
      projections.set(projection.projectId, projection);
    },
  };
};

/** Composition root. Admission policy and native repository ports are explicit. */
export const createHeadlessWorkbenchRuntime = async (
  options: HeadlessWorkbenchRuntimeOptions,
): Promise<HeadlessWorkbenchRuntime> => {
  const manifestPath = resolve(options.manifestPath);
  const manifestBytes = await readFile(manifestPath);
  const manifestDigest = createHash("sha256").update(manifestBytes).digest("hex");
  const ports = createNativeRepositoryCorpusPorts();
  const source: RepositoryCorpusSource = {
    ...ports,
    evidenceId: evidenceUuidV8(`aifsd:repository-corpus:${manifestDigest}`),
    manifestPath,
    now: () => new Date().toISOString(),
    sourceAuthority: {
      authorityId: "aifsd-headless-workbench-repository-corpus",
      kind: "integration",
    },
    taskGraphCommand: options.taskGraphCommand ?? [
      resolve(dirname(manifestPath), "node_modules", ".bin", "task-graph"),
    ],
  };
  const corpus = createRepositoryCorpusAdapter();
  const project = await corpus.projectId(source);
  if (!project.ok) throw new Error("The configured Task Graph project identity is invalid");
  if (options.taskAuthorityClient !== undefined) {
    let registration;
    let authenticatedClient;
    let reservationIdentity;
    try {
      registration = validateTaskAuthorityServiceRegistrationIdentity(
        options.taskAuthorityClient.projectRegistration,
      );
      authenticatedClient = validateAuthenticatedTaskAuthorityClient(
        options.taskAuthorityClient.authenticatedClient,
      );
      reservationIdentity = validateTaskAuthorityServiceReservationIdentity(
        options.taskAuthorityClient.reservationIdentity,
      );
    } catch {
      throw new Error("The Task Graph authority registration is invalid");
    }
    if (
      resolve(dirname(manifestPath), registration.projectManifestPath) !== manifestPath ||
      registration.projectManifestDigest !== manifestDigest ||
      authenticatedClient.projectInstanceId !== registration.projectInstanceId ||
      authenticatedClient.registrationRevision !== registration.registrationRevision ||
      reservationIdentity.serviceClient.projectInstanceId !== registration.projectInstanceId ||
      reservationIdentity.serviceClient.registrationRevision !==
        registration.registrationRevision ||
      taskAuthorityServiceReservationIdentityDigest(reservationIdentity) !==
        taskAuthorityServiceReservationIdentityDigest(
          createTaskAuthorityServiceReservationIdentity({
            authenticatedClient,
            caller: reservationIdentity.caller,
          }),
        )
    ) {
      throw new Error(
        "The Task Graph authority registration does not bind the configured manifest",
      );
    }
    if (options.nativeTaskIntents === undefined) {
      throw new Error("The Task Graph mutation boundary requires a durable native intent store");
    }
  }
  const digester = { digest: contentDigest };
  const journal = options.journal ?? createInMemoryProjectJournal(digester);
  if (options.projection !== undefined) await options.projection.migrate();
  const nativeTaskAuthority =
    options.taskAuthorityClient === undefined
      ? undefined
      : createTaskGraphNativeTaskAuthority({
          client: options.taskAuthorityClient,
          evidenceId: evidenceUuidV8(
            `aifsd:native-task-receipt:${manifestDigest}:${taskAuthorityServiceRegistrationDigest(
              options.taskAuthorityClient.projectRegistration,
            )}`,
          ),
          projectId: project.value,
          sourceAuthority: {
            authorityId: "aifsd-headless-workbench-task-graph-authority",
            kind: "integration",
          },
        });
  return {
    source,
    workbench: createHeadlessWorkbench({
      controlPlane: createProjectControlPlane({
        admissionAuthority: options.admissionAuthority,
        digester,
        journal,
        projectionStore: createHeadlessWorkbenchProjectionStore(options.projection),
      }),
      corpus,
      journal,
      ...(nativeTaskAuthority === undefined
        ? {}
        : {
            nativeTaskIntents: options.nativeTaskIntents!,
            nativeTaskReceipts: nativeTaskAuthority.receipts,
            ...(options.taskAuthorityExecution === "receipt-only"
              ? {}
              : { nativeTasks: nativeTaskAuthority.operator }),
          }),
    }),
  };
};
