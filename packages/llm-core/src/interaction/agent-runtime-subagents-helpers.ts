import { readRecord, readString, readStringArray } from "#adapters/utils";
import { bindFirst } from "#shared/fp";
import { maybeMap, maybeTap, type MaybePromise } from "#shared/maybe";
import { createTraceDiagnostics } from "#shared/reporting";
import type { Outcome } from "#workflow/types";
import type { AgentRuntimeInput } from "./agent-runtime";
import type { AgentEventState } from "./agent-runtime-events";
import { emitInteractionEvents } from "./transport";
import type { InteractionEvent, InteractionEventMeta, InteractionSubagentEvent } from "./types";
import type {
  SendInput,
  SpawnInput,
  SubagentManager,
  SubagentRecord,
  WaitInput,
} from "./agent-runtime-subagents-types";

type StringRecord = Record<string, unknown>;

export function toRecord(value: unknown): StringRecord {
  return readRecord(value) ?? {};
}

export function readStringField(record: StringRecord, key: string) {
  return readString(record[key]);
}

export function readAgentId(record: StringRecord) {
  return readStringField(record, "agentId") ?? readStringField(record, "id");
}

export function readSpawnInput(value: unknown): SpawnInput {
  const record = toRecord(value);
  return {
    agentId: readAgentId(record),
    name: readStringField(record, "name"),
    description: readStringField(record, "description"),
    tools: readStringArray(record.tools) ?? null,
  };
}

export function readSendInput(value: unknown): SendInput | null {
  const record = toRecord(value);
  const agentId = readAgentId(record);
  const text = readStringField(record, "text") ?? readStringField(record, "input");
  if (!agentId || !text) {
    return null;
  }
  return {
    agentId,
    text,
    context: readStringField(record, "context") ?? undefined,
    threadId: readStringField(record, "threadId") ?? undefined,
  };
}

function readAgentIdFromValue(value: unknown) {
  return readAgentId(toRecord(value));
}

export function readWaitInput(value: unknown): WaitInput | null {
  const agentId = readAgentIdFromValue(value);
  if (!agentId) {
    return null;
  }
  return { agentId };
}

export function buildSpawnResult(agentId: string, status: string) {
  return { agentId, status };
}

function buildOutcomeResult(agentId: string, outcome: Outcome<unknown> | null) {
  return {
    agentId,
    outcome,
  };
}

export function buildSendResult(agentId: string, outcome: Outcome<unknown>) {
  return buildOutcomeResult(agentId, outcome);
}

export function buildWaitResult(agentId: string, outcome: Outcome<unknown> | null) {
  return buildOutcomeResult(agentId, outcome);
}

export function buildCloseResult(agentId: string, closed: boolean) {
  return { agentId, closed };
}

export function buildErrorResult(
  code: string,
  data?: Record<string, unknown>,
): Record<string, unknown> & { error: string } {
  return { ...(data ?? {}), error: code };
}

export function buildMissingResult(code: string, agentId?: string) {
  return buildErrorResult(code, agentId ? { agentId } : undefined);
}

export function buildSubagentInteractionId(interactionId: string, agentId: string) {
  return `${interactionId}.subagent.${agentId}`;
}

function createAgentEventMeta(state: AgentEventState, sourceId: string): InteractionEventMeta {
  return {
    sequence: state.nextSequence(),
    timestamp: Date.now(),
    sourceId,
    correlationId: state.correlationId,
    interactionId: state.interactionId,
  };
}

function buildSubagentSourceId(agentId: string) {
  return `agent.${agentId}`;
}

function buildInteractionSubagentEvent(input: {
  state: AgentEventState;
  event: InteractionSubagentEvent;
}): InteractionEvent {
  return {
    kind: "subagent",
    event: input.event,
    meta: createAgentEventMeta(input.state, buildSubagentSourceId(input.event.agent.id)),
  };
}

export function emitSubagentEvent(
  manager: SubagentManager,
  event: InteractionSubagentEvent,
): MaybePromise<boolean | null> {
  if (!manager.eventStream || !manager.eventState) {
    return null;
  }
  const interactionEvent = buildInteractionSubagentEvent({
    state: manager.eventState,
    event,
  });
  return emitInteractionEvents(manager.eventStream, [interactionEvent]);
}

export function findSubagentRecord(manager: SubagentManager, agentId: string) {
  for (const record of manager.records) {
    if (record.id === agentId) {
      return record;
    }
  }
  return null;
}

export function countActiveSubagents(manager: SubagentManager) {
  let count = 0;
  for (const record of manager.records) {
    if (record.status !== "closed") {
      count += 1;
    }
  }
  return count;
}

export function createSubagentRecord(
  manager: SubagentManager,
  input: SpawnInput & { agentId: string },
): SubagentRecord {
  return {
    id: input.agentId,
    runtime: manager.runtimeFactory(manager.runtimeOptions),
    status: "idle",
    name: input.name ?? null,
    description: input.description ?? null,
    tools: input.tools ?? null,
  };
}

type SubagentEventType = "selected" | "started" | "completed" | "failed";

const normalizeSubagentError = (type: SubagentEventType, error?: string) => {
  if (type === "failed") {
    return error ?? "error";
  }
  return error;
};

const buildSubagentEvent = (
  type: SubagentEventType,
  record: SubagentRecord,
  error?: string,
): InteractionSubagentEvent => ({
  type,
  error: normalizeSubagentError(type, error),
  agent: {
    id: record.id,
    name: record.name ?? record.id,
    displayName: record.name ?? record.id,
    description: record.description ?? undefined,
    tools: record.tools ?? null,
  },
});

export const buildSubagentSelected = (record: SubagentRecord) =>
  buildSubagentEvent("selected", record);

export const buildSubagentStarted = (record: SubagentRecord) =>
  buildSubagentEvent("started", record);

export const buildSubagentCompleted = (record: SubagentRecord) =>
  buildSubagentEvent("completed", record);

export const buildSubagentFailed = (record: SubagentRecord, error?: string) =>
  buildSubagentEvent("failed", record, error);

const applySubagentOutcomeRecord = (record: SubagentRecord, outcome: Outcome<unknown>) => {
  record.status = "idle";
  record.lastOutcome = outcome;
  return outcome;
};

export function applySubagentCompleted(record: SubagentRecord, outcome: Outcome<unknown>) {
  return applySubagentOutcomeRecord(record, outcome);
}

export function applySubagentFailed(record: SubagentRecord, outcome: Outcome<unknown>) {
  return applySubagentOutcomeRecord(record, outcome);
}

export function emitSubagentCompleted(input: { manager: SubagentManager; record: SubagentRecord }) {
  return emitSubagentEvent(input.manager, buildSubagentCompleted(input.record));
}

export function emitSubagentFailed(input: { manager: SubagentManager; record: SubagentRecord }) {
  return emitSubagentEvent(input.manager, buildSubagentFailed(input.record, "subagent_failed"));
}

export function wrapSendResult(input: { agentId: string }, outcome: Outcome<unknown>) {
  return buildSendResult(input.agentId, outcome);
}

export function applySubagentOutcome(
  input: { manager: SubagentManager; record: SubagentRecord },
  outcome: Outcome<unknown>,
) {
  if (outcome.status === "error") {
    const applyError = bindFirst(applySubagentFailed, input.record);
    const emitError = bindFirst(emitSubagentFailed, input);
    applyError(outcome);
    return maybeTap(emitError, outcome);
  }
  const applyCompleted = bindFirst(applySubagentCompleted, input.record);
  const emitCompleted = bindFirst(emitSubagentCompleted, input);
  applyCompleted(outcome);
  return maybeTap(emitCompleted, outcome);
}

export function toSubagentErrorOutcome(error: unknown): Outcome<unknown> {
  return {
    status: "error",
    error,
    ...createTraceDiagnostics(),
  };
}

export function runSubagent(input: {
  record: SubagentRecord;
  runInput: AgentRuntimeInput;
}): MaybePromise<Outcome<unknown>> {
  return input.record.runtime.run(input.runInput);
}

export function handleSubagentRunError(
  _input: { manager: SubagentManager; record: SubagentRecord },
  error: unknown,
) {
  return toSubagentErrorOutcome(error);
}

export function wrapWaitResult(input: { agentId: string }, outcome: Outcome<unknown>) {
  return buildWaitResult(input.agentId, outcome);
}

export function wrapLastOutcome(input: {
  agentId: string;
  outcome: MaybePromise<Outcome<unknown>>;
}) {
  return maybeMap(bindFirst(wrapWaitResult, { agentId: input.agentId }), input.outcome);
}
