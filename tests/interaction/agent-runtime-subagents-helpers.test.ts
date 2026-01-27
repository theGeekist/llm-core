import { describe, expect, it } from "bun:test";
import type { EventStreamEvent } from "../../src/adapters/types";
import { createAgentEventState } from "../../src/interaction/agent-runtime-events";
import type { AgentRuntimeInput } from "../../src/interaction/agent-runtime";
import type { Outcome } from "../../src/workflow/types";
import type { MaybePromise } from "../../src/shared/maybe";
import {
  applySubagentOutcome,
  buildMissingResult,
  buildSubagentInteractionId,
  countActiveSubagents,
  createSubagentRecord,
  emitSubagentEvent,
  findSubagentRecord,
  readSendInput,
  readWaitInput,
  toSubagentErrorOutcome,
  wrapLastOutcome,
} from "../../src/interaction/agent-runtime-subagents-helpers";
import type { AgentRuntime } from "../../src/interaction/agent-runtime";
import type {
  SubagentManager,
  SubagentRecord,
} from "../../src/interaction/agent-runtime-subagents-types";
import { createTraceDiagnostics } from "../../src/shared/reporting";
import { bindFirst } from "../../src/shared/fp";

type RecordingStream = {
  events: EventStreamEvent[];
  emit: (event: EventStreamEvent) => boolean;
};

const recordEvent = (events: EventStreamEvent[], event: EventStreamEvent) => {
  events.push(event);
  return true;
};

const createRecordingStream = (): RecordingStream => {
  const events: EventStreamEvent[] = [];
  return {
    events,
    emit: bindFirst(recordEvent, events),
  };
};

const createOkOutcome = (): Outcome<unknown> => ({
  status: "ok",
  artefact: {},
  ...createTraceDiagnostics(),
});

const createErrorOutcome = (): Outcome<unknown> => ({
  status: "error",
  error: new Error("boom"),
  ...createTraceDiagnostics(),
});

const createRuntime = (): AgentRuntime => ({
  run: (_input: AgentRuntimeInput) => createOkOutcome(),
  stream: (_input: AgentRuntimeInput) => createOkOutcome(),
});

const createManager = (stream: RecordingStream): SubagentManager => ({
  records: [],
  maxActive: 2,
  idPrefix: "subagent",
  nextId: () => 1,
  runtimeFactory: () => createRuntime(),
  runtimeOptions: { model: { generate: () => ({ text: "ok" }) } },
  eventStream: { emit: stream.emit },
  eventState: createAgentEventState({ interactionId: "interaction-1", correlationId: "corr-1" }),
  interactionId: "interaction-1",
});

const createRecord = (manager: SubagentManager, agentId = "agent-1"): SubagentRecord =>
  createSubagentRecord(manager, { agentId });

const readLastOutcome = async (outcome: MaybePromise<Outcome<unknown>> | null) =>
  outcome ? await outcome : null;

const requireRecord = (records: SubagentRecord[]): SubagentRecord => {
  const record = records[0];
  if (!record) {
    throw new Error("Missing subagent record.");
  }
  return record;
};

const setRecordStatus = (record: SubagentRecord, status: SubagentRecord["status"]) => {
  record.status = status;
  return record;
};

describe("subagent helpers", () => {
  it("parses send and wait inputs", () => {
    expect(readSendInput({})).toBeNull();
    expect(readWaitInput({})).toBeNull();
    expect(readSendInput({ agentId: "agent-1", text: "hi" })?.agentId).toBe("agent-1");
    expect(readWaitInput({ agentId: "agent-1" })?.agentId).toBe("agent-1");
  });

  it("builds missing result payloads", () => {
    expect(buildMissingResult("missing", "agent-1")).toEqual({
      error: "missing",
      agentId: "agent-1",
    });
  });

  it("builds deterministic subagent interaction ids", () => {
    expect(buildSubagentInteractionId("root", "agent-1")).toBe("root.subagent.agent-1");
  });

  it("counts active subagents", () => {
    const stream = createRecordingStream();
    const manager = createManager(stream);
    const closed: SubagentRecord = { ...createRecord(manager, "agent-1"), status: "closed" };
    const running: SubagentRecord = { ...createRecord(manager, "agent-2"), status: "running" };
    manager.records = [closed, running];
    expect(countActiveSubagents(manager)).toBe(1);
  });

  it("finds subagent records by id", () => {
    const stream = createRecordingStream();
    const manager = createManager(stream);
    manager.records.push(createRecord(manager));
    expect(findSubagentRecord(manager, "agent-1")?.id).toBe("agent-1");
    expect(findSubagentRecord(manager, "missing")).toBeNull();
  });

  it("emits subagent events when a stream is available", () => {
    const stream = createRecordingStream();
    const manager = createManager(stream);
    const record = createRecord(manager);
    manager.records.push(record);
    emitSubagentEvent(manager, {
      type: "started",
      agent: { id: record.id, name: record.id, displayName: record.id, tools: null },
    });
    expect(stream.events[0]?.name).toBe("interaction.subagent");
  });

  it("applies subagent outcomes and emits lifecycle events", async () => {
    const stream = createRecordingStream();
    const manager = createManager(stream);
    const record = createRecord(manager);
    manager.records.push(record);
    setRecordStatus(record, "running");
    await applySubagentOutcome({ manager, record }, createOkOutcome());
    expect(record.status).toBe("idle");
    expect(record.lastOutcome).not.toBeNull();
    const errorRecord = requireRecord(manager.records);
    setRecordStatus(errorRecord, "running");
    await applySubagentOutcome({ manager, record: errorRecord }, createErrorOutcome());
    const lastOutcome = await readLastOutcome(errorRecord.lastOutcome ?? null);
    const isError = lastOutcome?.status === "error";
    expect(isError).toBe(true);
    if (isError && lastOutcome) {
      expect(lastOutcome.error).toBeInstanceOf(Error);
    }
  });

  it("wraps last outcomes into wait results", async () => {
    const outcome = createOkOutcome();
    const result = await wrapLastOutcome({ agentId: "agent-1", outcome: Promise.resolve(outcome) });
    expect(result.agentId).toBe("agent-1");
    expect(result.outcome?.status).toBe("ok");
  });

  it("builds subagent error outcomes", () => {
    const outcome = toSubagentErrorOutcome(new Error("oops"));
    expect(outcome.status).toBe("error");
    expect(outcome.trace.length).toBe(0);
  });
});
