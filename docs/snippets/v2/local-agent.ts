import { createLocalAgentRunner, prepareAgentSpec } from "@geekist/llm-core";
import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "@geekist/llm-core/contracts";

let idSequence = 1;
const uuid = () => `018f0f4e-8c5b-7a91-8c3b-${(idSequence++).toString(16).padStart(12, "0")}`;

// 1. Authoring: the spec is portable data.
const agent = prepareAgentSpec({
  agentId: "example.echo",
  version: contractVersion("2.0.0"),
  instructions: "Return the supplied input.",
  effectRequirement: "read-only",
});

// 2. Composition: live behavior enters through explicit ports.
const runner = createLocalAgentRunner({
  identity: {
    newRunId: () => newCoreId<RunId>(uuid()),
    newEventId: () => newCoreId<EventId>(uuid()),
    now: () => "2026-07-30T00:00:00.000Z",
  },
  runnerId: "example.local",
  runnerVersion: contractVersion("2.0.0"),
  program: {
    execute: ({ request, emitProgress }) => {
      emitProgress({ code: "working" });
      return { status: "completed", output: request.input };
    },
  },
});

// 3. Execution: a run exposes events and one terminal result.
const prepared = await runner.prepare(agent);
const run = await runner.start({
  agent: prepared,
  invocationContext: {
    invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
  },
  input: { prompt: "hello" },
});

for await (const event of run.events()) {
  console.log(event.kind);
}
console.log((await run.result()).status);
