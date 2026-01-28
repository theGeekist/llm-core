import type { AdapterCallContext, AdapterDiagnostic, AdapterMetadata } from "./core";
import type { MaybePromise } from "#shared/maybe";

export type SkillScope = "repo" | "user" | "system" | "admin";

export type SkillSnapshotEntry = {
  id: string;
  scope: SkillScope;
  path: string;
  hash: string;
};

export type SkillLoadRequest = {
  directories?: string[];
  disabled?: string[];
};

export type SkillLoadResult = {
  skills: SkillSnapshotEntry[];
  diagnostics?: AdapterDiagnostic[] | null;
};

export type SkillLoader = {
  load: (request: SkillLoadRequest, context?: AdapterCallContext) => MaybePromise<SkillLoadResult>;
  metadata?: AdapterMetadata | null;
};
