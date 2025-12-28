import type {
  PipelineReporter,
  PipelineRollback,
  PipelineStep,
  RunRollbackStackOptions,
} from "@wpkernel/pipeline/core";
import { runRollbackStack } from "@wpkernel/pipeline/core";
import type { MaybePromise } from "../../maybe";
import { bindFirst, maybeMap, toTrue } from "../../maybe";
import type { RollbackEntry, RollbackState } from "./rollback-types";
import { readRestartInterrupt } from "./pause-metadata";

type RollbackResult = {
  steps?: PipelineStep[];
  state?: RollbackState;
  context?: { reporter?: PipelineReporter };
};

type RollbackError = {
  error: unknown;
  entry: PipelineRollback;
  metadata: unknown;
};

const isRollbackState = (value: unknown): value is RollbackState =>
  !!value && typeof value === "object";

const readRollbackState = (result: RollbackResult) =>
  isRollbackState(result.state) ? result.state : undefined;

const readRollbackMap = (state: RollbackState | undefined) => state?.helperRollbacks;

const collectRollbackEntries = (map: Map<string, RollbackEntry[]>) => {
  const entries: RollbackEntry[] = [];
  for (const list of map.values()) {
    for (const entry of list) {
      entries.push(entry);
    }
  }
  return entries;
};

const readRollbackEntries = (result: RollbackResult) => {
  const state = readRollbackState(result);
  const map = readRollbackMap(state);
  if (!map) {
    return [];
  }
  return collectRollbackEntries(map);
};

const readSteps = (result: RollbackResult) => (result.steps ? [...result.steps] : []);

const addEntry = (map: Map<string, RollbackEntry[]>, entry: RollbackEntry) => {
  const list = map.get(entry.helper.key);
  if (list) {
    list.push(entry);
    return;
  }
  map.set(entry.helper.key, [entry]);
};

const buildEntryMap = (entries: RollbackEntry[]) => {
  const map = new Map<string, RollbackEntry[]>();
  for (const entry of entries) {
    addEntry(map, entry);
  }
  return map;
};

const appendEntries = (target: RollbackEntry[], list: RollbackEntry[] | undefined) => {
  if (!list) {
    return;
  }
  for (const entry of list) {
    target.push(entry);
  }
};

const orderRollbackEntries = (entries: RollbackEntry[], steps: PipelineStep[]) => {
  const map = buildEntryMap(entries);
  const ordered: RollbackEntry[] = [];
  for (const step of steps) {
    appendEntries(ordered, map.get(step.key));
    map.delete(step.key);
  }
  for (const list of map.values()) {
    appendEntries(ordered, list);
  }
  return ordered;
};

const toRollbackStack = (entries: RollbackEntry[], steps: PipelineStep[]) => {
  const ordered = orderRollbackEntries(entries, steps);
  const stack: PipelineRollback[] = [];
  for (const entry of ordered) {
    stack.push(entry.rollback);
  }
  return stack;
};

const readReporter = (result: RollbackResult) => result.context?.reporter;

const warnRollbackFailure = (reporter: PipelineReporter, input: RollbackError) => {
  reporter.warn?.("Helper rollback failed during pause", {
    error: input.error,
    entry: input.entry,
    metadata: input.metadata,
  });
};

const createRollbackErrorHandler = (reporter: PipelineReporter | undefined) =>
  reporter ? bindFirst(warnRollbackFailure, reporter) : undefined;

const createRollbackOptions = (
  reporter: PipelineReporter | undefined,
): RunRollbackStackOptions => ({
  source: "helper",
  onError: createRollbackErrorHandler(reporter),
});

const hasRollbacks = (entries: RollbackEntry[]) => entries.length > 0;

export const runPauseRollback = (result: unknown): MaybePromise<boolean | null> => {
  if (!readRestartInterrupt(result)) {
    return null;
  }
  const typed = result as RollbackResult;
  const entries = readRollbackEntries(typed);
  if (!hasRollbacks(entries)) {
    return null;
  }
  const steps = readSteps(typed);
  const reporter = readReporter(typed);
  const options = createRollbackOptions(reporter);
  return maybeMap(toTrue, runRollbackStack(toRollbackStack(entries, steps), options));
};
