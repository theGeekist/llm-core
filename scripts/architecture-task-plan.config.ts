const authorityConfiguration = {
  aifsd: {
    architectureRoot: "packages/aifsd/docs/final-architecture",
    logicalMount: "packages/aifsd/docs",
    optional: true,
    governingReading: [
      "AGENTS.md",
      "README.md",
      "packages/aifsd/README.md",
      "packages/aifsd/docs/final-architecture/README.md",
      "packages/aifsd/docs/final-architecture/COORDINATION.md",
      "packages/aifsd/docs/final-architecture/tasks/README.md",
    ],
  },
  "llm-core": {
    architectureRoot: "packages/llm-core/docs/final-architecture",
    logicalMount: null,
    optional: false,
    governingReading: [
      "AGENTS.md",
      "README.md",
      "packages/llm-core/README.md",
      "packages/llm-core/docs/final-architecture/README.md",
      "packages/llm-core/docs/handoffs/implement-v2-code.md",
      "packages/llm-core/docs/final-architecture/COORDINATION.md",
      "packages/llm-core/docs/final-architecture/tasks/README.md",
    ],
  },
} as const;

const taskStatuses = [
  "proposed",
  "ready",
  "claimed",
  "in_progress",
  "review",
  "blocked",
  "done",
  "cancelled",
] as const;
const outputFormats = ["table", "json"] as const;
const taskFrontMatterFields = [
  "architecture_version",
  "base_sha",
  "branch",
  "conflicts_with",
  "decision_dependencies",
  "depends_on",
  "evidence_milestone",
  "forward_to",
  "id",
  "lease_expires_at",
  "lease_started_at",
  "legacy_id",
  "owner",
  "owner_kind",
  "preferred_owner_kind",
  "priority",
  "read_scope",
  "replaced_by",
  "required_reading",
  "review_owner",
  "stage",
  "status",
  "title",
  "updated_at",
  "worktree",
  "write_scope",
] as const;

export type OutputFormat = (typeof outputFormats)[number];
export type TaskAuthority = keyof typeof authorityConfiguration;
export type TaskPriority = "critical" | "high" | "medium" | "normal";
export type TaskStatus = (typeof taskStatuses)[number];

interface AuthorityConfiguration {
  readonly architectureRoot: string;
  readonly governingReading: readonly string[];
  readonly logicalMount: string | null;
  readonly optional: boolean;
}

interface ContextSourceConfiguration {
  readonly mutableReadingStatuses: readonly TaskStatus[] | null;
  readonly pathPrefix: string | null;
  readonly rootFromWorkspace: string;
}

interface TaskPlanMessages {
  readonly context: {
    readonly additionalReadAuthority: string;
    readonly blockers: string;
    readonly defaulted: string;
    readonly dependencyBriefs: string;
    readonly decisionReading: string;
    readonly governingContext: string;
    readonly historicalContext: string;
    readonly includedAbove: string;
    readonly noneDeclared: string;
    readonly priority: string;
    readonly ref: string;
    readonly selectedTask: string;
    readonly task: string;
    readonly title: string;
    readonly status: string;
    readonly why: string;
    readonly writeBoundary: string;
  };
  readonly errors: {
    readonly architectureAuthorityUnavailable: string;
    readonly cannotResolveGitRoot: string;
    readonly contextTaskRequired: string;
    readonly contextMountUnavailable: string;
    readonly decisionFilename: string;
    readonly decisionStatusMissing: string;
    readonly duplicateTaskKey: string;
    readonly duplicateDecisionKey: string;
    readonly duplicateOption: string;
    readonly duplicateFrontMatterKey: string;
    readonly gitStatusFailed: string;
    readonly invalidPriority: string;
    readonly duplicateReading: string;
    readonly duplicateReadingField: string;
    readonly invalidReadingEntry: string;
    readonly invalidReadingObject: string;
    readonly invalidReadingPath: string;
    readonly invalidReadingRef: string;
    readonly invalidReadingRevision: string;
    readonly invalidFrontMatterKey: string;
    readonly indentedFrontMatter: string;
    readonly invalidGitStatusEntry: string;
    readonly invalidStatus: string;
    readonly missingFrontMatter: string;
    readonly missingContextSource: string;
    readonly missingReading: string;
    readonly missingReadingPath: string;
    readonly missingReadingRef: string;
    readonly missingWriteScope: string;
    readonly missingOptionValue: string;
    readonly nonEmptyString: string;
    readonly stringList: string;
    readonly readingOutsideScope: string;
    readonly readingOutsideSource: string;
    readonly mutableReadingStatus: string;
    readonly unknownAuthority: string;
    readonly unknownConflictTarget: string;
    readonly unknownFormat: string;
    readonly unknownOption: string;
    readonly unknownReadingField: string;
    readonly unknownTask: string;
    readonly unknownFrontMatterKey: string;
    readonly optionDoesNotTakeValue: string;
    readonly taskRequiresContext: string;
    readonly unexpectedArgument: string;
    readonly unterminatedFrontMatter: string;
    readonly frontMatterMapping: string;
    readonly formatNotAllowedInContext: string;
  };
  readonly plan: {
    readonly authoritySafetyUnavailable: string;
    readonly activeConflict: string;
    readonly activeOverlap: string;
    readonly blockedLifecycle: string;
    readonly conflictActive: string;
    readonly dependencyStatus: string;
    readonly dirtyPath: string;
    readonly missingDecision: string;
    readonly missingDependency: string;
    readonly omittedPriority: string;
    readonly optionalAuthorityUnavailable: string;
    readonly readingSourceSafetyUnavailable: string;
    readonly readingSourceUnavailable: string;
    readonly overlappingActive: string;
    readonly deferredByPriority: string;
    readonly decisionStatus: string;
  };
  readonly table: {
    readonly active: string;
    readonly canStart: string;
    readonly candidates: string;
    readonly defaultPriority: string;
    readonly defaultedPriority: string;
    readonly diagnostics: string;
    readonly emptyCell: string;
    readonly none: string;
    readonly priority: string;
    readonly title: string;
  };
}

export interface TaskPlanConfiguration {
  readonly authorities: Readonly<Record<TaskAuthority, AuthorityConfiguration>>;
  readonly cli: {
    readonly allAuthorities: string;
    readonly defaultFormat: OutputFormat;
    readonly formats: readonly OutputFormat[];
    readonly options: {
      readonly authority: string;
      readonly context: string;
      readonly format: string;
      readonly task: string;
    };
  };
  readonly contextSources: readonly ContextSourceConfiguration[];
  readonly decisions: {
    readonly acceptedStatus: string;
    readonly directory: string;
    readonly filename: RegExp;
    readonly statusLine: RegExp;
  };
  readonly files: {
    readonly encoding: BufferEncoding;
    readonly markdownExtension: string;
    readonly readme: string;
    readonly tasksDirectory: string;
  };
  readonly frontMatter: {
    readonly allowedTaskFields: readonly string[];
    readonly conflictsWith: string;
    readonly decisionDependencies: string;
    readonly dependsOn: string;
    readonly id: string;
    readonly priority: string;
    readonly requiredReading: string;
    readonly readScope: string;
    readonly status: string;
    readonly title: string;
    readonly writeScope: string;
  };
  readonly readingEntry: {
    readonly path: string;
    readonly reason: string;
    readonly ref: string;
  };
  readonly messages: TaskPlanMessages;
  readonly lifecycle: {
    readonly active: readonly TaskStatus[];
    readonly allowed: readonly TaskStatus[];
    readonly blocked: TaskStatus;
    readonly candidates: readonly TaskStatus[];
    readonly dependencySatisfied: TaskStatus;
  };
  readonly pipeline: {
    readonly helperKind: string;
    readonly helperMode: "extend" | "merge" | "override";
  };
  readonly priority: {
    readonly default: TaskPriority;
    readonly weights: Readonly<Record<TaskPriority, number>>;
  };
}

export const taskPlanConfiguration: TaskPlanConfiguration = {
  authorities: authorityConfiguration,
  cli: {
    allAuthorities: "all",
    defaultFormat: "table",
    formats: outputFormats,
    options: {
      authority: "--authority",
      context: "--context",
      format: "--format",
      task: "--task",
    },
  },
  contextSources: [
    {
      mutableReadingStatuses: null,
      pathPrefix: "context/aifsd-research",
      rootFromWorkspace: "context/aifsd-research",
    },
    {
      mutableReadingStatuses: taskStatuses,
      pathPrefix: "context/simple-chat",
      rootFromWorkspace: "context/simple-chat",
    },
    { mutableReadingStatuses: null, pathPrefix: null, rootFromWorkspace: "." },
  ],
  decisions: {
    acceptedStatus: "accepted",
    directory: "decisions",
    filename: /^(ADR-\d{3})-/,
    statusLine: /^Status:\s*([^;\n]+)/m,
  },
  files: {
    encoding: "utf8",
    markdownExtension: ".md",
    readme: "README.md",
    tasksDirectory: "tasks",
  },
  frontMatter: {
    allowedTaskFields: taskFrontMatterFields,
    conflictsWith: "conflicts_with",
    decisionDependencies: "decision_dependencies",
    dependsOn: "depends_on",
    id: "id",
    priority: "priority",
    readScope: "read_scope",
    requiredReading: "required_reading",
    status: "status",
    title: "title",
    writeScope: "write_scope",
  },
  messages: {
    context: {
      additionalReadAuthority: "Additional read authority",
      blockers: "Blockers",
      defaulted: "defaulted",
      dependencyBriefs: "Direct dependency briefs",
      decisionReading: "Named decision reading",
      governingContext: "Governing context",
      historicalContext: "Required historical and contextual reading",
      includedAbove: "included above",
      noneDeclared: "none declared",
      priority: "Priority",
      ref: "Ref",
      selectedTask: "Selected task brief",
      status: "Status",
      task: "Task",
      title: "Title",
      why: "Why",
      writeBoundary: "Write boundary",
    },
    errors: {
      architectureAuthorityUnavailable: "architecture authority unavailable",
      cannotResolveGitRoot: "cannot resolve Git root from",
      contextTaskRequired: "context mode requires <authority>/<task>",
      contextMountUnavailable: "required context mount is unavailable",
      decisionFilename: "ADR filename has no identifier",
      decisionStatusMissing: "ADR has no status field",
      duplicateOption: "option provided more than once",
      duplicateDecisionKey: "duplicate qualified decision key",
      duplicateFrontMatterKey: "duplicate front matter field",
      duplicateTaskKey: "duplicate qualified task key",
      frontMatterMapping: "front matter must be a mapping",
      formatNotAllowedInContext: "format option is unavailable in context mode",
      gitStatusFailed: "git status failed in",
      invalidPriority: "invalid priority",
      invalidStatus: "invalid status",
      missingFrontMatter: "missing front matter",
      missingContextSource: "context source configuration has no fallback",
      nonEmptyString: "must be a non-empty string",
      duplicateReading: "duplicates required reading",
      duplicateReadingField: "duplicate required reading field",
      invalidReadingEntry: "required reading entry must be a mapping",
      invalidReadingObject: "required reading revision path must identify a Git blob",
      invalidReadingPath: "required reading path must name an exact local file",
      invalidReadingRef: "required reading ref must be a full Git commit id",
      invalidReadingRevision: "required reading ref does not identify a Git commit",
      invalidFrontMatterKey: "invalid front matter field syntax",
      indentedFrontMatter: "front matter root mapping must not be indented",
      invalidGitStatusEntry: "invalid NUL-delimited Git status entry",
      missingReading: "must be a non-empty required reading list",
      missingReadingPath: "required reading file does not exist",
      missingReadingRef: "required reading revision does not contain file",
      missingWriteScope: "must be a non-empty write scope",
      missingOptionValue: "option requires a value",
      readingOutsideScope: "required reading is outside read_scope",
      readingOutsideSource: "required reading escapes configured source",
      mutableReadingStatus: "mutable required reading is unavailable for lifecycle",
      stringList: "must be a string list",
      unknownReadingField: "unknown required reading field",
      unknownAuthority: "unknown authority",
      unknownConflictTarget: "conflicts_with names unknown task",
      unknownFormat: "unknown format",
      unknownOption: "unknown option",
      unknownTask: "unknown task",
      unknownFrontMatterKey: "unknown front matter field",
      optionDoesNotTakeValue: "option does not take a value",
      taskRequiresContext: "task selection requires context mode",
      unexpectedArgument: "unexpected positional argument",
      unterminatedFrontMatter: "unterminated front matter",
    },
    plan: {
      activeConflict: "active conflict with",
      activeOverlap: "active write scope overlaps",
      authoritySafetyUnavailable: "global safety authority unavailable",
      blockedLifecycle: "lifecycle is blocked",
      conflictActive: "conflicts with active",
      decisionStatus: "decision status",
      deferredByPriority: "deferred while priority is",
      dependencyStatus: "dependency status",
      dirtyPath: "write scope contains dirty path",
      missingDecision: "missing decision",
      missingDependency: "missing dependency",
      omittedPriority: "priority omitted; using",
      optionalAuthorityUnavailable: "optional authority unavailable; omitted from plan",
      readingSourceSafetyUnavailable: "global reading source unavailable",
      readingSourceUnavailable: "required reading source unavailable; admission disabled",
      overlappingActive: "write scope overlaps active",
    },
    table: {
      active: "Active",
      canStart: "canStart",
      candidates: "Candidates",
      defaultPriority: "Default priority",
      defaultedPriority: "* defaulted priority",
      diagnostics: "Diagnostics",
      emptyCell: "-",
      none: "none",
      priority: "Priority",
      title: "Architecture task plan",
    },
  },
  readingEntry: {
    path: "path",
    reason: "reason",
    ref: "ref",
  },
  lifecycle: {
    active: ["claimed", "in_progress", "review", "blocked"],
    allowed: taskStatuses,
    blocked: "blocked",
    candidates: ["proposed", "ready"],
    dependencySatisfied: "done",
  },
  pipeline: {
    helperKind: "task",
    helperMode: "extend",
  },
  priority: {
    default: "normal",
    weights: {
      critical: 400,
      high: 300,
      medium: 200,
      normal: 100,
    },
  },
};

export const taskAuthorities = Object.keys(taskPlanConfiguration.authorities) as TaskAuthority[];
