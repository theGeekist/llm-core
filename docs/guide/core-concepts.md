# Core concepts

Four ideas shape `llm-core`.

## Descriptions are data

An `AgentSpec` describes a probabilistic agent. It is not a workflow or a live
runtime. An `AgentRunner` prepares the spec, starts an `AgentRun`, and produces
one terminal `RunResult`.

A workflow is explicit application orchestration. It coordinates author-defined
steps and reports through workflow outcomes. Keeping these execution models
separate makes their state and failure semantics honest.

## Capabilities are ports

Models, tools, policy, evidence, state, storage, retrieval, media, and agents
have neutral contracts. Provider adapters implement those contracts behind
qualified integration subpaths. Application code coordinates public ports
rather than framework-native objects.

## Interactions are projections

Interaction sessions turn canonical run and content events into deterministic
UI state. Reconnection is process-local continuity. Durable checkpoints and
durable execution handles are separate state lifetimes.

## Effects take one controlled path

Tool policy does not execute tools. Approval does not authorize arbitrary
effects. Controlled execution records evidence through storage-neutral ports
and fails closed when required guarantees are absent.

Provider-native metadata may be projected as safe JSON only after redaction. It
uses a reverse-DNS namespace and never carries credentials or live provider
objects.
