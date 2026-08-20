import type {
  ProjectCommand,
  RuntimeNeutralProjectView,
} from "../../packages/aifsd/src/project-semantics/public.js";

export interface MobileProjectScreen {
  readonly projectId: string;
  readonly checkpoint: number;
  readonly projectionFresh: boolean;
  readonly contradictionCount: number;
}

export const toMobileProjectScreen = (view: RuntimeNeutralProjectView): MobileProjectScreen => ({
  projectId: view.projectId,
  checkpoint: view.journalCheckpoint.position,
  projectionFresh: view.projectionFresh,
  contradictionCount: view.tasks.filter(({ readiness }) => readiness === "contradictory").length,
});

export const mobileCommandKind = (command: ProjectCommand): ProjectCommand["kind"] => command.kind;
