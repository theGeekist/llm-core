---
architecture_version: 2
id: integrations-connector-characterization
title: Characterize unlike connector vertical slices
stage: integrations
status: done
priority: high
preferred_owner_kind: codex
owner: codex-connector-characterization
owner_kind: codex
lease_started_at: 2026-08-25T09:48:00+08:00
lease_expires_at: 2026-08-27T09:48:00+08:00
base_sha: 459154191a946c8710de2a06ea507862de870398
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-external-contract-fidelity
  - architecture-source-layout-normalization
  - language-rollout
  - adapters-protocol-qualification
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-007
  - ADR-014
  - ADR-015
  - ADR-017
conflicts_with:
write_scope:
  - packages/llm-core/tests/integrations/characterization/**
  - packages/llm-core/docs/final-architecture/tasks/integrations-connector-characterization.md
required_reading:
  - path: context/simple-chat/README.md
    reason: "Keep scaffold-only status explicit so planned MCP behaviour is not cited as executable qualification."
  - path: context/simple-chat/docs/protocols/mcp-adapter.md
    reason: "Use planned MCP lifecycle and delivery distinctions as contextual evidence, not a generic connector contract."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Keep A2A identity and delegation outside the connector abstraction."
read_scope:
  - context/simple-chat/README.md
  - context/simple-chat/docs/protocols/mcp-adapter.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/tools/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-08
---

# integrations-connector-characterization — Characterize unlike connector vertical slices

## Objective

Prove common and non-common connector semantics with two unlike private
vertical slices before freezing a shared connector contract.

## In scope

- An executable MCP tool/resource discovery and controlled-invocation slice
  consuming the qualified public MCP surface with task-local application ports
  and state.
- An independently implemented executable OAuth-backed SaaS slice covering
  consent references, pagination, rate limits and webhook or polling
  reconciliation with its own task-local ports and state.
- A field-by-field commonality, unsupported-operation and reliability report.

## Out of scope

- Public connector types, production credentials, provider publication or A2A
  delegation.

## Acceptance criteria

- Both slices enter meaningful effects through the existing control path.
- Both slices execute discovery, preparation, invocation, failure and
  reconciliation journeys; static fixture comparison alone cannot satisfy
  characterization.
- Neither slice imports a shared connector abstraction or shared task-local
  connector base. Similarity is derived only after both executable slices work.
- Portable fixtures contain no credential values or SDK-native objects.
- The report traces every proposed shared field and operation to observable
  evidence in both slices and records rejected similarities.
- A2A identity, task and delegation state remains separately characterized.

## Verification

```sh
bun test packages/llm-core/tests/integrations/characterization
bun run typecheck:tests
bun run lint
```

## Work log

Execution mode: shared-checkout
Execution rationale: Characterization is confined to a new task-owned test subtree and its task record.
Concurrency evaluation: native-agent-conversation-runtime-contract; start alongside because the characterization task cannot edit production or native-agent paths.
Concurrent task scopes: native-agent-conversation-runtime-contract owns agent, interaction, focused tests, agent capability documentation and its task record.
Swarm delegation: codex-root -> codex-connector-characterization: implement the two unlike executable connector slices and evidence report; declared task write scope.

2026-08-25: Claimed by the coordinator from
`459154191a946c8710de2a06ea507862de870398` alongside the disjoint native-agent
conversation contract task. Planned by ADR-015.

2026-08-25: Executed two task-local characterization slices without production
changes. The MCP slice uses the qualified stateless public host for tool and
resource discovery, controlled invocation, sanitised failure and receipt
reconciliation. The independent OAuth SaaS slice owns its consent reference,
pagination cursor, rate-limit disposition, webhook deduplication and
receipt-bound reconciliation while using the same existing controlled-effect
path. The
evidence report rejects a connector base, shared lifecycle, shared retry or
pagination model, credential fields and A2A mapping.

## Handoff

Request transition to `review`.

- Base SHA: `459154191a946c8710de2a06ea507862de870398`.
- Execution mode: shared checkout, alongside the disjoint
  `native-agent-conversation-runtime-contract` scope.
- Changed files: task-owned MCP and OAuth characterization tests, the
  task-owned evidence report, and this work log/handoff only.
- Evidence: `bun test packages/llm-core/tests/integrations/characterization`
  passes 2 tests and 23 assertions; package test typecheck passes; scoped ESLint
  and Prettier checks pass; `git diff --check` passes.
- No shared connector abstraction, production connector type, credential
  fixture, provider SDK object or A2A identity/delegation state was introduced.
- Remaining risk: two executable slices establish only the limited common
  controlled-effect boundary. A later contract task must not promote any other
  field without further unlike-consumer evidence.

2026-08-25 review remediation: the evidence report now maps each observed
operation, each proposed common controlled-effect operation and every rejected
similarity to the named executable test plus exact source lines. MCP failure
now asserts its bounded sanitised protocol result and excludes the underlying
native error text. OAuth reconciliation now consumes the accepted receipt-bound
webhook, rejects its duplicate before state change, and asserts webhook-before-
reconciliation ordering. Request same-reviewer re-review.

2026-08-26: The same independent reviewer approved the final task-owned diff
with no actionable findings. The approved implementation is commit `a43dd94`.
