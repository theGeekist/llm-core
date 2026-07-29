# Vocabulary

## AgentSpec

Portable description of a probabilistic agent: instructions, effects, metadata,
and skills.

## AgentRunner

Executable port that prepares specs and starts or resumes runs.

## AgentRun

Live handle for one execution. It exposes typed events and controls, then
terminates exactly once.

## RunResult

Terminal agent result: `completed`, `failed`, `denied`, or `cancelled`.

## Workflow

Explicit application orchestration of author-defined steps. It is distinct from
an agent loop.

## InvocationContext

Portable execution identity, authority, trace, limits, and opaque secret
references propagated through capability ports.

## Capability binding

Pairing of a portable evidence-backed descriptor with an exact immutable live
port facade. Resolution is deterministic and fails on missing, ambiguous, or
incompatible requirements.
