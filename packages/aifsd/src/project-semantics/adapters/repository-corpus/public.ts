import type {
  ArchitectureDecision,
  ArchitectureTask,
  ArchitectureTaskPlan,
  ScopeAlias,
  TaskGraphProject,
} from "@geekist/task-graph";
import type {
  CorrelationId,
  Digest,
  EvidenceId,
  ProjectAuthority,
  ProjectObservation,
  ProjectProvenance,
  ProjectResult,
} from "../../public.js";

export interface RepositoryCommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** A deliberately narrow command boundary used only for the native Task Graph CLI. */
export interface RepositoryCommandPort {
  readonly run: (
    command: readonly string[],
    options: { readonly cwd: string },
  ) => Promise<RepositoryCommandResult>;
}

export interface RepositoryGitState {
  readonly dirtyPaths: readonly string[];
  readonly scopeAliases: readonly ScopeAlias[];
}

export interface RepositoryGitPort {
  readonly revision: (workspaceRoot: string) => Promise<string>;
  readonly workspaceState: (
    workspaceRoot: string,
    logicalMounts: readonly string[],
  ) => Promise<RepositoryGitState>;
}

export interface RepositoryDocumentPort {
  readonly readText: (workspaceRoot: string, path: string, ref?: string | null) => Promise<string>;
}

export interface RepositoryCorpusSource {
  readonly command: RepositoryCommandPort;
  readonly documents: RepositoryDocumentPort;
  readonly evidenceId: EvidenceId;
  readonly git: RepositoryGitPort;
  readonly manifestPath: string;
  readonly now: () => string;
  readonly sourceAuthority: ProjectAuthority;
  readonly taskGraphCommand: readonly string[];
}

export interface RepositoryTaskLifecycle {
  readonly leaseExpiresAt?: string;
  readonly leaseStartedAt?: string;
  readonly owner?: string;
  readonly ownerKind?: string;
  readonly worktree?: string;
}

/**
 * A source-identifiable task record. Its lifecycle values are observed task
 * front matter, never an AIFSD-owned status.
 */
export interface RepositoryTaskRecord {
  readonly contentDigest: Digest;
  readonly lifecycle: RepositoryTaskLifecycle;
  readonly task: ArchitectureTask;
}

/** A native STATUS.md is observed as a projection and never lifecycle authority. */
export interface RepositoryStatusProjection {
  readonly contentDigest: Digest;
  readonly lifecycleByTask: Readonly<Record<string, string>>;
  readonly matchesTaskLifecycle: boolean;
  readonly mismatches: readonly string[];
  readonly path: string;
}

export type RepositoryDocumentRole = "decision" | "governing" | "required-reading";

/** Byte-derived identity for a validated governed corpus document. */
export interface RepositoryDocumentIdentity {
  readonly authority: string;
  readonly contentDigest: Digest;
  readonly path: string;
  readonly ref: string | null;
  readonly role: RepositoryDocumentRole;
}

export interface RepositoryCorpusImport {
  readonly decisions: readonly ArchitectureDecision[];
  readonly documents: readonly RepositoryDocumentIdentity[];
  readonly observations: readonly ProjectObservation[];
  readonly plan: ArchitectureTaskPlan;
  readonly project: TaskGraphProject;
  readonly projectId: string;
  readonly provenance: ProjectProvenance;
  readonly revision: string;
  readonly statuses: readonly RepositoryStatusProjection[];
  readonly tasks: readonly RepositoryTaskRecord[];
}

export interface RepositoryTaskPlan {
  readonly plan: ArchitectureTaskPlan;
  readonly provenance: ProjectProvenance;
  readonly revision: string;
}

export interface RepositoryTaskContext {
  readonly command: readonly string[];
  readonly outputDigest: Digest;
  readonly provenance: ProjectProvenance;
  readonly taskKey: string;
  readonly text: string;
}

export interface RepositoryCorpusAdapter {
  readonly compileTaskContext: (
    source: RepositoryCorpusSource,
    taskKey: string,
  ) => Promise<ProjectResult<RepositoryTaskContext>>;
  readonly import: (
    source: RepositoryCorpusSource,
  ) => Promise<ProjectResult<RepositoryCorpusImport>>;
  readonly plan: (source: RepositoryCorpusSource) => Promise<ProjectResult<RepositoryTaskPlan>>;
  /** The only project identity this configured repository source may address. */
  readonly projectId: (source: RepositoryCorpusSource) => Promise<ProjectResult<string>>;
}

export interface RepositoryCorpusObservationInput {
  readonly correlationId: CorrelationId;
  readonly import_: RepositoryCorpusImport;
  readonly observationId: string;
}

export {
  createNativeRepositoryCorpusPorts,
  createRepositoryCorpusAdapter,
  createRepositoryCorpusObservation,
  repositoryCorpusSnapshotDigest,
} from "./task-graph.js";
