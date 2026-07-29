# Run an agent

An agent definition is portable data. A runner supplies live behavior and must
prepare the definition before it can execute it.

```ts
import { createLocalAgentRunner } from "@geekist/llm-core";
import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "@geekist/llm-core/contracts";

let sequence = 0;
const nextUuid = () => `018f0f4e-8c5b-7a91-8c3b-${(++sequence).toString(16).padStart(12, "0")}`;

const runner = createLocalAgentRunner({
  runnerId: "example.local",
  runnerVersion: contractVersion("2.0.0"),
  identity: {
    newRunId: () => newCoreId<RunId>(nextUuid()),
    newEventId: () => newCoreId<EventId>(nextUuid()),
    now: () => new Date().toISOString(),
  },
  program: {
    execute: ({ request, emitProgress }) => {
      emitProgress({ code: "answering" });
      return { status: "completed", output: request.input };
    },
  },
});

const agent = await runner.prepare({
  agentId: "example.echo",
  version: contractVersion("2.0.0"),
  instructions: "Return the supplied input.",
  effectRequirement: "read-only",
});

const run = await runner.start({
  agent,
  invocationContext: {
    invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
  },
  input: { prompt: "hello" },
});

for await (const event of run.events()) {
  console.log(event.kind, event.sequence);
}

const result = await run.result();
```

The lifecycle is capability discovery, runner-owned preparation, start, event
consumption, then exactly one terminal result. Cancellation acknowledgement is
separate from terminal cancellation. A controlled agent must be composed with
the controlled tool-execution port; otherwise preparation fails closed.

`prepareAgentSpec` remains useful for validating portable agent data before a
runner is selected. The selected runner must still call `runner.prepare()` so
the prepared value is bound to that runner instance.
