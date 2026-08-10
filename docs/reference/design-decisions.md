# Design decisions

The public architecture follows a small set of decisions that shape every capability.

## Portable data and live behavior have separate homes

Portable contracts are JSON-compatible, versioned, and explicit about identity. Provider clients, functions, byte resolvers, clocks, journals, and other live behavior enter through typed ports during composition.

## Capabilities own their contracts

Models, tools, control, evidence, state, context, artifacts, evaluation, and portable agent intent expose explicit package subpaths. Concrete agent and workflow execution belongs to qualified runtime integrations.

## Meaningful effects fail closed

An effect follows one controlled path: canonical action binding, durable receipt reservation, policy, approval when required, concurrency, durable started state, execution, and terminal settlement or reconciliation.

No best-effort event delivery is treated as proof that an effect did or did not happen.

## Receipts use a storage-neutral port

Core defines the receipt lifecycle and optimistic journal contract. Applications choose the database or durable system that implements it.

## Events are redacted projections

Agent events, controlled-execution evidence, and interaction content are distinct closed families. Provider-native observations enter evidence only through validated redacted extensions. Event sinks project facts; they are not authoritative stores.

## State names carry guarantees

Live continuations, snapshots, resumable checkpoints, provider sessions, and durable execution handles remain separate. Registration and compatibility checks occur before resume.

## Integrations are qualified

Each published adapter names its host explicitly. There is no broad adapter barrel, and native host types stay behind the adapter boundary.

## Version 2 replaces rather than aliases

The ESM-only surface uses the final names directly. The [migration guide](/reference/migration-2) maps deleted 1.x concepts to their current owners.
