import type {
  ProjectCommand,
  RuntimeNeutralProjectView,
} from "../../packages/aifsd/src/project-semantics/public.js";

export const renderProjectFacts = (view: RuntimeNeutralProjectView): string =>
  JSON.stringify({
    projectId: view.projectId,
    checkpoint: view.journalCheckpoint.position,
    projectionFresh: view.projectionFresh,
    tasks: view.tasks.map(({ taskId, readiness, completion }) => ({
      taskId,
      readiness,
      completion,
    })),
  });

export const commandKind = (command: ProjectCommand): ProjectCommand["kind"] => command.kind;
