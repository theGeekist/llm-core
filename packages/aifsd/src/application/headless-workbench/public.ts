import type { CorrelationId, EventId, JsonValue } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  JournalAppendDisposition,
  JournalCheckpoint,
  ProjectEventJournal,
  ProjectObservation,
  ProjectResult,
  RuntimeNeutralProjectView,
} from "../../project-semantics/public.js";
import type { ProjectControlPlane } from "../project/public.js";
import type {
  RepositoryCorpusAdapter,
  RepositoryCorpusSource,
  RepositoryTaskContext,
} from "../../project-semantics/adapters/repository-corpus/public.js";
import type { HeadlessWorkbenchStatusProjection } from "./status-projection.js";

export type HeadlessWorkbenchOperationKind =
  | "admitTask"
  | "deriveReadiness"
  | "explainBlockers"
  | "compileTaskContext"
  | "claimTask"
  | "delegateWork"
  | "recordObservation"
  | "submitEvidence"
  | "acceptResult"
  | "projectStatus";

interface OperationBase {
  readonly correlationId: CorrelationId;
  readonly operationId: string;
  readonly kind: HeadlessWorkbenchOperationKind;
}

interface ProjectOperation extends OperationBase {
  readonly projectId: string;
}

interface AdmissionOperation extends OperationBase {
  readonly eventId: EventId;
  readonly observation: ProjectObservation;
}

export interface CompileTaskContextOperation extends ProjectOperation {
  readonly eventId: EventId;
  readonly kind: "compileTaskContext";
  readonly source: RepositoryCorpusSource;
  readonly taskKey: string;
}

export interface RecordRepositoryCorpusOperation extends OperationBase {
  readonly eventId: EventId;
  readonly kind: "recordObservation";
  readonly source: RepositoryCorpusSource;
}

export type {
  ClaimTaskOperation,
  DelegateTaskOperation,
  NativeTaskExecutionIntent,
  NativeTaskIntentReservation,
  NativeTaskIntentStore,
  NativeTaskOperation,
  NativeTaskOperator,
  NativeTaskReceiptAuthority,
} from "../../project-semantics/adapters/native-task-authority/public.js";
import type {
  NativeTaskIntentStore,
  NativeTaskOperation,
  NativeTaskOperator,
  NativeTaskReceiptAuthority,
} from "../../project-semantics/adapters/native-task-authority/public.js";

export interface ExplainBlockersOperation extends ProjectOperation {
  readonly kind: "explainBlockers";
  readonly taskKey: string;
}

export interface DeriveReadinessOperation extends ProjectOperation {
  readonly kind: "deriveReadiness";
}

export interface ProjectStatusOperation extends ProjectOperation {
  readonly kind: "projectStatus";
}

export type HeadlessWorkbenchOperation =
  | (AdmissionOperation & { readonly kind: "admitTask" })
  | (AdmissionOperation & { readonly kind: "submitEvidence" })
  | (AdmissionOperation & { readonly kind: "acceptResult" })
  | CompileTaskContextOperation
  | RecordRepositoryCorpusOperation
  | NativeTaskOperation
  | ExplainBlockersOperation
  | DeriveReadinessOperation
  | ProjectStatusOperation;

/**
 * Native task mutation is an injected authority. The workbench never writes
 * task front matter or invokes a lifecycle command itself.
 */
export interface HeadlessWorkbenchDependencies {
  readonly corpus: RepositoryCorpusAdapter;
  readonly controlPlane: ProjectControlPlane;
  readonly journal: ProjectEventJournal;
  readonly nativeTaskIntents?: NativeTaskIntentStore;
  readonly nativeTaskReceipts?: NativeTaskReceiptAuthority;
  readonly nativeTasks?: NativeTaskOperator;
}

export interface HeadlessWorkbenchBlockerExplanation {
  readonly blockers: readonly string[];
  readonly readiness: RuntimeNeutralProjectView["tasks"][number]["readiness"];
  readonly taskKey: string;
}

export interface HeadlessWorkbenchOperationReceipt {
  readonly context?: RepositoryTaskContext;
  readonly correlationId: string;
  readonly journal?: HeadlessWorkbenchJournalReceipt;
  readonly kind: HeadlessWorkbenchOperationKind;
  readonly nativeResult?: JsonValue;
  readonly operationId: string;
  readonly status?: HeadlessWorkbenchStatusProjection;
  readonly task?: HeadlessWorkbenchBlockerExplanation;
  readonly view?: RuntimeNeutralProjectView;
}

/** The serialisable evidence that an operation changed admitted project meaning. */
export interface HeadlessWorkbenchJournalReceipt {
  readonly appendDisposition: JournalAppendDisposition;
  readonly checkpoint: JournalCheckpoint;
  readonly event: AcceptedProjectEvent;
}

export interface HeadlessWorkbench {
  readonly dispatch: (
    operation: HeadlessWorkbenchOperation,
  ) => Promise<ProjectResult<HeadlessWorkbenchOperationReceipt>>;
}

export { createHeadlessWorkbench } from "./workbench.js";
export {
  renderHeadlessWorkbenchStatus,
  type HeadlessWorkbenchStatusProjection,
} from "./status-projection.js";
export {
  dispatchHeadlessWorkbenchWire,
  headlessWorkbenchOperationFromWire,
  type HeadlessWorkbenchDeliveryDependencies,
  type HeadlessWorkbenchWireOperation,
} from "./delivery.js";
