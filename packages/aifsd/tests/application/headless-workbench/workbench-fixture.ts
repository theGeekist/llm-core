import type { JsonValue } from "@geekist/llm-core/contracts";
import {
  createHeadlessWorkbench,
  type NativeTaskIntentStore,
  type NativeTaskOperation,
  type NativeTaskOperator,
  type NativeTaskReceiptAuthority,
} from "../../../src/application/headless-workbench/public.js";
import {
  createInMemoryNativeTaskIntentStore,
  createNativeTaskExecutionIntent,
} from "../../../src/project-semantics/adapters/native-task-authority/public.js";
import {
  createProjectControlPlane,
  type ProjectProjectionStore,
} from "../../../src/application/project/public.js";
import { contentDigest } from "../../../src/config/content-digest.js";
import { createRepositoryCorpusAdapter } from "../../../src/project-semantics/adapters/repository-corpus/public.js";
import { createInMemoryProjectJournal } from "../../../src/project-semantics/public.js";
import type {
  ProjectEventJournal,
  ProjectObservation,
  ProjectProjection,
  ProjectResult,
} from "../../../src/project-semantics/public.js";

export interface WorkbenchFixtureOptions {
  readonly decisionNow?: () => string;
  readonly journal?: ProjectEventJournal;
  readonly monotonicAdmission?: boolean;
  readonly nativeTaskIntents?: NativeTaskIntentStore;
  readonly nativeTaskReceipts?: NativeTaskReceiptAuthority;
  readonly nativeTasks?: NativeTaskOperator;
}

export const workbench = ({
  decisionNow,
  journal: providedJournal,
  monotonicAdmission = false,
  nativeTaskIntents,
  nativeTaskReceipts,
  nativeTasks,
}: WorkbenchFixtureOptions = {}) => {
  const projections = new Map<string, ProjectProjection>();
  const store: ProjectProjectionStore = {
    read: async (projectId) => projections.get(projectId) ?? null,
    replace: async (projection) => {
      projections.set(projection.projectId, projection);
    },
  };
  const digester = { digest: contentDigest };
  const journal = providedJournal ?? createInMemoryProjectJournal(digester);
  const coordinated = createProjectControlPlane({
    admissionAuthority: {
      authorityId: "fixture-admission",
      decide: monotonicAdmission
        ? (request, context) => ({
            authority: { authorityId: "fixture-admission", kind: "coordinator" },
            decidedAt: new Date(
              Math.max(
                decisionNow === undefined ? Number.NEGATIVE_INFINITY : Date.parse(decisionNow()),
                Date.parse(request.observation.observedAt),
                context.latestAdmittedAt === null
                  ? Number.NEGATIVE_INFINITY
                  : Date.parse(context.latestAdmittedAt),
              ),
            ).toISOString(),
            decisionId: `admission:${request.observation.observationId}`,
            policyId: "fixture-admission/v1",
          })
        : (request) => ({
            authority: { authorityId: "fixture-admission", kind: "coordinator" },
            decidedAt: request.observation.observedAt,
            decisionId: `admission:${request.observation.observationId}`,
            policyId: "fixture-admission/v1",
          }),
    },
    digester,
    journal,
    projectionStore: store,
  });
  return createHeadlessWorkbench({
    corpus: createRepositoryCorpusAdapter(),
    controlPlane: coordinated,
    journal,
    ...(nativeTaskIntents === undefined ? {} : { nativeTaskIntents }),
    ...(nativeTaskReceipts === undefined ? {} : { nativeTaskReceipts }),
    ...(nativeTasks === undefined ? {} : { nativeTasks }),
  });
};

export const fixtureNativeAuthority = (
  execute: (
    operation: NativeTaskOperation,
  ) => Promise<
    ProjectResult<{ readonly nativeResult: JsonValue; readonly observation: ProjectObservation }>
  >,
): Required<
  Pick<WorkbenchFixtureOptions, "nativeTaskIntents" | "nativeTaskReceipts" | "nativeTasks">
> => {
  const durable = new Map<
    string,
    {
      readonly nativeResult: JsonValue;
      readonly intentDigest: string;
      readonly observationDigest: string;
      readonly operationDigest: string;
    }
  >();
  return {
    nativeTasks: {
      prepare: async (operation) => ({
        ok: true,
        value: createNativeTaskExecutionIntent({
          authorityId: "fixture-native-authority",
          operation,
          payload: { kind: "fixture-native-intent" },
        }),
      }),
      execute: async (operation, intent) => {
        const executed = await execute(operation);
        if (!executed.ok) return executed;
        durable.set(operation.eventId, {
          nativeResult: executed.value.nativeResult,
          intentDigest: intent.integrityDigest,
          observationDigest: contentDigest(executed.value.observation).value,
          operationDigest: contentDigest(operation).value,
        });
        return { ok: true, value: { observation: executed.value.observation } };
      },
    },
    nativeTaskIntents: createInMemoryNativeTaskIntentStore(),
    nativeTaskReceipts: {
      authorityId: "fixture-native-receipt-authority",
      verify: async (operation, intent, observation) => {
        const proof = durable.get(operation.eventId);
        return proof !== undefined &&
          proof.intentDigest === intent.integrityDigest &&
          proof.operationDigest === contentDigest(operation).value &&
          proof.observationDigest === contentDigest(observation).value
          ? { ok: true, value: { nativeResult: proof.nativeResult } }
          : {
              ok: false,
              diagnostics: [
                { code: "admission-denied" as const, reasonCode: "authority-denied" as const },
              ],
            };
      },
    },
  };
};
