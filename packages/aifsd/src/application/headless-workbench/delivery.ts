import type { CorrelationId, JsonValue } from "@geekist/llm-core/contracts";
import type { ProjectDiagnostic, ProjectResult } from "../../project-semantics/public.js";
import type { RepositoryCorpusSource } from "../../project-semantics/adapters/repository-corpus/public.js";
import type {
  HeadlessWorkbench,
  HeadlessWorkbenchOperation,
  HeadlessWorkbenchOperationReceipt,
} from "./public.js";

export type HeadlessWorkbenchWireOperation = Readonly<Record<string, JsonValue>>;

export interface HeadlessWorkbenchDeliveryDependencies {
  readonly corpusSource: RepositoryCorpusSource;
  readonly workbench: HeadlessWorkbench;
}

const malformed = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "invalid-observation", reasonCode: "required-field-missing" }],
});

const stringAt = (operation: HeadlessWorkbenchWireOperation, key: string): string | null => {
  const value = operation[key];
  return typeof value === "string" && value !== "" ? value : null;
};

const base = (
  operation: HeadlessWorkbenchWireOperation,
): { readonly correlationId: CorrelationId; readonly operationId: string } | null => {
  const correlationId = stringAt(operation, "correlationId");
  const operationId = stringAt(operation, "operationId");
  return correlationId === null || operationId === null
    ? null
    : { correlationId: correlationId as CorrelationId, operationId };
};

const project = (
  operation: HeadlessWorkbenchWireOperation,
): { readonly projectId: string; readonly taskKey?: string } | null => {
  const projectId = stringAt(operation, "projectId");
  const taskKey = stringAt(operation, "taskKey");
  return projectId === null ? null : { projectId, ...(taskKey === null ? {} : { taskKey }) };
};

const event = (operation: HeadlessWorkbenchWireOperation): string | null =>
  stringAt(operation, "eventId");

const targetOwner = (
  operation: HeadlessWorkbenchWireOperation,
): { readonly id: string; readonly kind: string } | null => {
  const value = operation.targetOwner;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const id = stringAt(value, "id");
  const kind = stringAt(value, "kind");
  return id === null ||
    kind === null ||
    Object.keys(value).some((key) => key !== "id" && key !== "kind")
    ? null
    : { id, kind };
};

const admissionOperation = (
  operation: HeadlessWorkbenchWireOperation,
  kind: "admitTask" | "submitEvidence" | "acceptResult",
): HeadlessWorkbenchOperation | null => {
  const common = base(operation);
  const eventId = event(operation);
  const observation = operation.observation;
  return common === null || eventId === null || observation === undefined
    ? null
    : {
        ...common,
        kind,
        eventId: eventId as never,
        observation: observation as never,
      };
};

interface WireContext {
  readonly common: NonNullable<ReturnType<typeof base>>;
  readonly corpusSource: RepositoryCorpusSource;
  readonly operation: HeadlessWorkbenchWireOperation;
}

type WireOperationResolver = (context: WireContext) => HeadlessWorkbenchOperation | null;

const projectOperation = (context: WireContext) => project(context.operation);

const operationResolvers: Readonly<Record<string, WireOperationResolver>> = {
  admitTask: ({ operation }) => admissionOperation(operation, "admitTask"),
  submitEvidence: ({ operation }) => admissionOperation(operation, "submitEvidence"),
  acceptResult: ({ operation }) => admissionOperation(operation, "acceptResult"),
  recordObservation: ({ common, corpusSource, operation }) => {
    const eventId = event(operation);
    return eventId === null
      ? null
      : ({
          ...common,
          eventId: eventId as never,
          kind: "recordObservation",
          source: corpusSource,
        } as const);
  },
  deriveReadiness: (context) => {
    const selected = projectOperation(context);
    return selected === null
      ? null
      : ({ ...context.common, kind: "deriveReadiness", projectId: selected.projectId } as const);
  },
  projectStatus: (context) => {
    const selected = projectOperation(context);
    return selected === null
      ? null
      : ({ ...context.common, kind: "projectStatus", projectId: selected.projectId } as const);
  },
  compileTaskContext: (context) => {
    const selected = projectOperation(context);
    const eventId = event(context.operation);
    return selected === null || selected.taskKey === undefined || eventId === null
      ? null
      : ({
          ...context.common,
          eventId: eventId as never,
          kind: "compileTaskContext",
          projectId: selected.projectId,
          source: context.corpusSource,
          taskKey: selected.taskKey,
        } as const);
  },
  explainBlockers: (context) => {
    const selected = projectOperation(context);
    return selected === null || selected.taskKey === undefined
      ? null
      : ({
          ...context.common,
          kind: "explainBlockers",
          projectId: selected.projectId,
          taskKey: selected.taskKey,
        } as const);
  },
  claimTask: (context) => {
    const selected = projectOperation(context);
    const eventId = event(context.operation);
    const leaseExpiresAt = stringAt(context.operation, "leaseExpiresAt");
    return selected === null ||
      selected.taskKey === undefined ||
      eventId === null ||
      leaseExpiresAt === null
      ? null
      : ({
          ...context.common,
          eventId: eventId as never,
          kind: "claimTask",
          leaseExpiresAt,
          projectId: selected.projectId,
          taskKey: selected.taskKey,
        } as const);
  },
  delegateWork: (context) => {
    const selected = projectOperation(context);
    const eventId = event(context.operation);
    const claimFence = stringAt(context.operation, "claimFence");
    const leaseExpiresAt = stringAt(context.operation, "leaseExpiresAt");
    const owner = targetOwner(context.operation);
    return selected === null ||
      selected.taskKey === undefined ||
      eventId === null ||
      claimFence === null ||
      leaseExpiresAt === null ||
      owner === null
      ? null
      : ({
          ...context.common,
          claimFence,
          eventId: eventId as never,
          kind: "delegateWork",
          leaseExpiresAt,
          projectId: selected.projectId,
          taskKey: selected.taskKey,
          targetOwner: owner,
        } as const);
  },
};

/**
 * Convert a JSON transport request to the shared operation model. Repository
 * ports are dependency-bound, so transports cannot smuggle command, Git or
 * filesystem capabilities through their request body.
 */
export const headlessWorkbenchOperationFromWire = (
  operation: HeadlessWorkbenchWireOperation,
  corpusSource: RepositoryCorpusSource,
): ProjectResult<HeadlessWorkbenchOperation> => {
  const common = base(operation);
  const kind = stringAt(operation, "kind");
  if (common === null || kind === null) return malformed();
  const resolved = operationResolvers[kind]?.({ common, corpusSource, operation }) ?? null;
  return resolved === null ? malformed() : { ok: true, value: resolved };
};

export const dispatchHeadlessWorkbenchWire = async (
  dependencies: HeadlessWorkbenchDeliveryDependencies,
  operation: HeadlessWorkbenchWireOperation,
): Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>> => {
  const resolved = headlessWorkbenchOperationFromWire(operation, dependencies.corpusSource);
  return resolved.ok ? dependencies.workbench.dispatch(resolved.value) : resolved;
};

export const headlessWorkbenchDiagnostics = (
  result: ProjectResult<HeadlessWorkbenchOperationReceipt>,
): readonly ProjectDiagnostic[] => (result.ok ? [] : result.diagnostics);
