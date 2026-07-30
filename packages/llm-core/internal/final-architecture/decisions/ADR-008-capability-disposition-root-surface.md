# ADR-008 — Legacy Capability Disposition and Curated Root Surface

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-141, P0-142, P0-143, P0-149, P0-150
Supersedes: none

## Context

P0 convergence found supported retrieval, indexing, storage, conversation
memory, media, schema, skill and registry contracts still owned by adapters.
Deleting them would discard tested behavior; retaining them would violate the
feature-first dependency boundary. ADR-001 also left the exact curated root
surface unresolved.

## Decision

- Preserve supported capability behavior as neutral ports, not hosted
  databases, engines, credential stores or provider-native objects.
- Migrate knowledge/retrieval/indexing, storage/conversation and
  media/model-schema/agent-skill contracts in three disjoint P0 spokes.
- Build typed capability bindings only after those fronts exist.
- Keep legacy implementations and tests unchanged as evidence until P0-150
  atomically switches call sites and deletes the old adapter-owned contracts.
- Publish exactly these v2 subpaths:
  `.`, `./functional`, `./contracts`, `./model`, `./tools`, `./control`,
  `./evidence`, `./state`, `./agent`, `./workflow`, `./interaction`,
  `./adapters/ai-sdk`, `./adapters/ai-sdk-ui`, `./adapters/assistant-ui`,
  `./adapters/openai-chatkit`, and `./adapters/nlux-ui`.
- The root is the minimal orchestration surface. Its sole runtime value is
  `createLocalAgentRunner`; prepared specifications are produced only by
  `AgentRunner.prepare()`. Named root types are
  `AgentSpec`, `PreparedAgentSpec`, `AgentRunner`, `AgentRunnerCapabilities`,
  `AgentRun`, `AgentRunRequest`, `AgentRunEvent`, `RunResult`, `MaybePromise`
  and `MaybeAsyncIterable`. Everything else is imported from an explicit
  subpath.
- P0-150 publishes version `2.0.0`, validates runtime and declaration targets
  from an isolated consumer, and removes the legacy public subpaths.
- Convergence documentation starts only after the `docs-v2` branch is
  integrated or explicitly frozen and rebased.

## Consequences

P0 gains four bounded tasks before convergence, but no supported surface is
silently discarded and P0-150 no longer invents domain semantics. Root imports
remain useful without becoming a second aggregate feature barrel.
