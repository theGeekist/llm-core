import type {
  AdapterBundle,
  AdapterDiagnostic,
  SkillLoadRequest,
  SkillLoadResult,
  SkillLoader,
  SkillSnapshotEntry,
} from "#adapters/types";
import { bindFirst } from "#shared/fp";
import {
  createAdapterDiagnostic,
  createContractDiagnostic,
  createResumeDiagnostic,
} from "#shared/diagnostics";
import type { MaybePromise } from "#shared/maybe";
import { maybeMap } from "#shared/maybe";
import type { DiagnosticEntry, TraceEvent } from "#shared/reporting";
import type { AgentLoopConfig, AgentLoopStateSnapshot, InteractionState } from "./types";

export type AgentSkillState = {
  skills?: SkillSnapshotEntry[];
  diagnostics: DiagnosticEntry[];
};

type SkillLoadInput = {
  config?: AgentLoopConfig;
  adapters?: AdapterBundle;
  state?: InteractionState;
};

const AGENT_LOOP_SNAPSHOT_KIND = "agent.loop.snapshot";
const SKILL_IDENTITY_KEYS = ["scope", "id", "path", "hash"] as const;

function readSkillLoader(adapters?: AdapterBundle): SkillLoader | null {
  return adapters?.skills ?? null;
}

function readSkillDirectories(config?: AgentLoopConfig): string[] | null {
  const directories = config?.skills?.directories ?? [];
  if (directories.length === 0) {
    return null;
  }
  return directories;
}

function readSkillRequest(config?: AgentLoopConfig): SkillLoadRequest | null {
  const directories = readSkillDirectories(config);
  if (!directories) {
    return null;
  }
  const disabled = config?.skills?.disabled ?? undefined;
  return { directories, disabled };
}

function readSnapshotFromTrace(trace?: TraceEvent[]): AgentLoopStateSnapshot | null {
  if (!trace || trace.length === 0) {
    return null;
  }
  let snapshot: AgentLoopStateSnapshot | null = null;
  for (const entry of trace) {
    if (entry.kind === AGENT_LOOP_SNAPSHOT_KIND) {
      const data = entry.data as { snapshot?: AgentLoopStateSnapshot } | undefined;
      if (data?.snapshot) {
        snapshot = data.snapshot;
      }
    }
  }
  return snapshot;
}

function readSnapshotSkills(state?: InteractionState): SkillSnapshotEntry[] | null {
  const snapshot = readSnapshotFromTrace(state?.trace);
  if (!snapshot?.skills) {
    return null;
  }
  return snapshot.skills;
}

function trimValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function isNonEmpty(value: string): boolean {
  return value.length > 0;
}

function sanitizeSkillEntry(entry: SkillSnapshotEntry): SkillSnapshotEntry | null {
  const id = trimValue(entry.id);
  const path = trimValue(entry.path);
  const hash = trimValue(entry.hash);
  if (!isNonEmpty(id) || !isNonEmpty(path) || !isNonEmpty(hash)) {
    return null;
  }
  return {
    id,
    scope: entry.scope,
    path,
    hash,
  };
}

function compareSkillValues(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareSkills(left: SkillSnapshotEntry, right: SkillSnapshotEntry): number {
  for (const key of SKILL_IDENTITY_KEYS) {
    const comparison = compareSkillValues(left[key], right[key]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

const createSkillIdentity = (entry: SkillSnapshotEntry) =>
  SKILL_IDENTITY_KEYS.map((key) => entry[key]).join(":");

function normalizeSkills(skills: SkillSnapshotEntry[]): SkillSnapshotEntry[] {
  const cleaned: SkillSnapshotEntry[] = [];
  for (const entry of skills) {
    const sanitized = sanitizeSkillEntry(entry);
    if (sanitized) {
      cleaned.push(sanitized);
    }
  }
  if (cleaned.length === 0) {
    return [];
  }
  cleaned.sort(compareSkills);
  const deduped: SkillSnapshotEntry[] = [];
  let lastKey = "";
  for (const entry of cleaned) {
    const key = createSkillIdentity(entry);
    if (key !== lastKey) {
      deduped.push(entry);
      lastKey = key;
    }
  }
  return deduped;
}

function normalizePreviousSkills(skills: SkillSnapshotEntry[] | null) {
  if (!skills || skills.length === 0) {
    return null;
  }
  return normalizeSkills(skills);
}

function buildSkillMismatchDiagnostic(input: {
  previous: SkillSnapshotEntry[];
  next: SkillSnapshotEntry[];
}): DiagnosticEntry {
  return createResumeDiagnostic("Skill snapshot mismatch on resume.", {
    previous: input.previous,
    next: input.next,
  });
}

function buildMissingSkillAdapterDiagnostic(request: SkillLoadRequest): DiagnosticEntry {
  return createContractDiagnostic("Skill adapter missing for agent loop.", {
    directories: request.directories,
  });
}

function buildInvalidSkillDiagnostic(entry: SkillSnapshotEntry): DiagnosticEntry {
  return createContractDiagnostic("Invalid skill snapshot entry.", { entry });
}

function appendAdapterDiagnostics(
  diagnostics: DiagnosticEntry[],
  adapterDiagnostics?: Array<AdapterDiagnostic | null>,
) {
  if (!adapterDiagnostics || adapterDiagnostics.length === 0) {
    return diagnostics;
  }
  for (const entry of adapterDiagnostics) {
    if (entry) {
      diagnostics.push(createAdapterDiagnostic(entry, "skills"));
    }
  }
  return diagnostics;
}

function appendInvalidSkillsDiagnostics(
  diagnostics: DiagnosticEntry[],
  skills: SkillSnapshotEntry[],
) {
  for (const entry of skills) {
    const sanitized = sanitizeSkillEntry(entry);
    if (!sanitized) {
      diagnostics.push(buildInvalidSkillDiagnostic(entry));
    }
  }
  return diagnostics;
}

function areSkillSnapshotsEqual(
  previous: SkillSnapshotEntry[],
  next: SkillSnapshotEntry[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }
  for (let idx = 0; idx < previous.length; idx += 1) {
    const left = previous[idx];
    const right = next[idx];
    if (!left || !right) {
      return false;
    }
    if (compareSkills(left, right) !== 0) {
      return false;
    }
  }
  return true;
}

type NormalizeSkillLoadInput = {
  result: SkillLoadResult;
  previous: SkillSnapshotEntry[] | null;
};

function normalizeSkillLoadResult(input: NormalizeSkillLoadInput): AgentSkillState {
  const diagnostics: DiagnosticEntry[] = [];
  const skills = input.result.skills ?? [];
  appendAdapterDiagnostics(diagnostics, input.result.diagnostics ?? undefined);
  appendInvalidSkillsDiagnostics(diagnostics, skills);
  const normalized = normalizeSkills(skills);
  const previous = normalizePreviousSkills(input.previous);
  if (previous && !areSkillSnapshotsEqual(previous, normalized)) {
    diagnostics.push(buildSkillMismatchDiagnostic({ previous, next: normalized }));
  }
  return { skills: normalized, diagnostics };
}

function buildMissingSkillAdapterState(request: SkillLoadRequest): AgentSkillState {
  return { skills: undefined, diagnostics: [buildMissingSkillAdapterDiagnostic(request)] };
}

function createSkillLoadInput(input: SkillLoadInput): {
  request: SkillLoadRequest;
  loader: SkillLoader | null;
  previous: SkillSnapshotEntry[] | null;
} | null {
  const request = readSkillRequest(input.config);
  if (!request) {
    return null;
  }
  const loader = readSkillLoader(input.adapters);
  const previous = readSnapshotSkills(input.state);
  return { request, loader, previous };
}

function mapSkillLoadResult(
  input: { previous: SkillSnapshotEntry[] | null },
  result: SkillLoadResult,
): AgentSkillState {
  return normalizeSkillLoadResult({ result, previous: input.previous });
}

export function resolveAgentSkills(input: SkillLoadInput): MaybePromise<AgentSkillState> | null {
  const prepared = createSkillLoadInput(input);
  if (!prepared) {
    return null;
  }
  if (!prepared.loader) {
    return buildMissingSkillAdapterState(prepared.request);
  }
  const result = prepared.loader.load(prepared.request);
  return maybeMap(bindFirst(mapSkillLoadResult, { previous: prepared.previous }), result);
}
