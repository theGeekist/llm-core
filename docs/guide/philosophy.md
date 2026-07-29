# Why llm-core?

LLM features often begin as a direct provider call. Parsing, retries, tools,
storage, and human approval arrive later. The original script becomes the place
where unrelated concerns meet.

`llm-core` gives those concerns explicit boundaries:

- specs capture portable intent;
- runners own live agent execution;
- workflows coordinate author-defined steps;
- capability ports keep provider choices local;
- interactions project canonical events into application state;
- policy, approval, execution, and receipts remain separate.

## Structure that survives change

A model integration can change without redefining tool authority. A UI
integration can change without becoming the source of execution truth. A
persisted checkpoint can be inspected without embedding a live continuation.

That separation also narrows tests. You can test a portable spec without a
provider client, a workflow step without an agent loop, a policy without
executing a tool, and an interaction projection without a UI framework.

## Portability with explicit limits

Portability means JSON-compatible contracts with explicit identity and
versioning. It does not mean that every runtime supports every adapter.

The package currently publishes ESM only and requires Node.js 22 or newer.
Compatibility claims belong to qualified adapters and conformance results, not
to the neutral contracts themselves.

## Evidence instead of accidental logs

Observability should not depend on capturing every native payload. The package
uses precise event families for precise purposes:

- `AgentRunEvent` reports agent lifecycle;
- `ExecutionEvent` carries redacted controlled-execution evidence;
- `InteractionEvent` drives deterministic projections.

This model makes useful evidence representable while excluding credentials,
live provider objects, and raw sensitive tool data. Storage remains an
application choice through explicit ports.

## Control before convenience

Read-only work can stay lightweight. Meaningful effects take the controlled
path through binding, policy, approval when required, execution, and receipt
recording.

That path fails closed when a required guarantee is missing. After an
interruption, an effect recorded as started or indeterminate is reconciled
instead of replayed. The extra structure protects systems where “try again” can
send a second payment, publish twice, or repeat another external side effect.

## Adopt one boundary at a time

The package does not require one all-encompassing runtime. You can begin with a
local agent, add capability bindings as dependencies grow, introduce workflows
for explicit application sequencing, and project interaction events when a UI
needs deterministic state.

The result is not abstraction for its own sake. It is a system where intent,
authority, execution, evidence, and presentation can change independently
without losing their contracts.

Start with [Get started](/guide/hello-world), or inspect the exact
[package exports](/reference/package-exports).
