import type {
  AcceptedProjectEvent,
  AdmissionAuthority,
  AdmissionRequest,
  ProjectContentDigester,
  ProjectEventJournal,
  ProjectProjection,
  ProjectResult,
  RuntimeNeutralProjectView,
} from "../../project-semantics/public.js";
import { admitProjectEvent } from "../../project-semantics/admission.js";
import { buildProjectProjection } from "../../project-semantics/projection.js";

export interface ProjectProjectionStore {
  readonly replace: (projection: ProjectProjection) => Promise<void>;
  readonly read: (projectId: string) => Promise<ProjectProjection | null>;
}

export interface ProjectControlPlane {
  readonly admit: (request: AdmissionRequest) => Promise<ProjectResult<RuntimeNeutralProjectView>>;
  readonly rebuild: (projectId: string) => Promise<ProjectResult<RuntimeNeutralProjectView>>;
  readonly view: (projectId: string) => Promise<ProjectResult<RuntimeNeutralProjectView>>;
}

export interface ProjectControlPlaneDependencies {
  readonly journal: ProjectEventJournal;
  readonly projectionStore: ProjectProjectionStore;
  readonly admissionAuthority: AdmissionAuthority;
  readonly digester: ProjectContentDigester;
}

const noEvents = (): ProjectResult<never> => ({
  ok: false,
  diagnostics: [{ code: "projection-drift", reasonCode: "projection-missing" }],
});

const projectEvents = async (
  projectId: string,
  journal: ProjectEventJournal,
): Promise<ProjectResult<readonly AcceptedProjectEvent[]>> => {
  const events = await journal.read(projectId);
  return events.length === 0 ? noEvents() : { ok: true, value: events };
};

const viewFrom = (
  projection: ProjectProjection,
  projectionFresh: boolean,
): RuntimeNeutralProjectView => ({
  projectId: projection.projectId,
  journalCheckpoint: projection.checkpoint,
  projectionProtocolVersion: projection.protocolVersion,
  projectionDigest: projection.projectionDigest,
  projectionFresh,
  tasks: projection.tasks,
  assertions: projection.assertions,
  reconciliation: null,
});

export const createProjectControlPlane = (
  dependencies: ProjectControlPlaneDependencies,
): ProjectControlPlane => {
  const { admissionAuthority, digester, journal, projectionStore } = dependencies;
  const expectedProjection = async (projectId: string) => {
    const events = await projectEvents(projectId, journal);
    return events.ok ? buildProjectProjection(events.value, digester) : events;
  };

  const rebuild = async (projectId: string): Promise<ProjectResult<RuntimeNeutralProjectView>> => {
    const projection = await expectedProjection(projectId);
    if (!projection.ok) return projection;
    await projectionStore.replace(projection.value);
    return { ok: true, value: viewFrom(projection.value, true) };
  };

  const view = async (projectId: string): Promise<ProjectResult<RuntimeNeutralProjectView>> => {
    const expected = await expectedProjection(projectId);
    if (!expected.ok) return expected;
    const actual = await projectionStore.read(projectId);
    const fresh =
      actual !== null &&
      actual.protocolVersion === expected.value.protocolVersion &&
      actual.checkpoint.position === expected.value.checkpoint.position &&
      actual.checkpoint.journalDigest.value === expected.value.checkpoint.journalDigest.value &&
      actual.projectionDigest.value === expected.value.projectionDigest.value;
    return { ok: true, value: viewFrom(expected.value, fresh) };
  };

  const admit = async (
    request: AdmissionRequest,
  ): Promise<ProjectResult<RuntimeNeutralProjectView>> => {
    const admitted = await admitProjectEvent(request, admissionAuthority, digester);
    if (!admitted.ok) return admitted;
    const appended = await journal.append(admitted.value);
    if (!appended.ok) return appended;
    return rebuild(admitted.value.projectId);
  };

  return { admit, rebuild, view };
};
