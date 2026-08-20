# Adapter estate inventory

Status: working characterisation, not architecture authority

## Purpose

This document stops the adapter discussion at the evidence boundary. It records what exists, which implementations are deliberately interchangeable, what is published, what is qualified, and which product and SDK decisions remain unresolved.

It does not change package exports, accept a decision, claim publication support, or replace package task authority.

## Executive correction

The adapter estate is not principally a collection of unrelated ecosystem integrations. A substantial part of it implements the same portable llm-core capabilities through different external ecosystems.

AI SDK, LangChain and LlamaIndex overlap deliberately across model, prompt, retrieval, indexing, storage and conversation concerns. The existing parity tests prove that common portable contracts can be exercised through multiple implementations. Runtime substitution is also an explicit architectural objective for LangGraph and PydanticAI.

The missing layer is therefore not an AIFSD wrapper for every llm-core export. The missing work is a complete, qualified adapter catalogue and an explicit AIFSD selection plane that can choose among compatible implementations without moving portable semantics out of llm-core.

## Estate categories

### Capability substitution adapters

These provide ecosystem-native implementations of portable llm-core ports.

| Ecosystem  | Implemented capabilities                                                                                                                                                                                    | Current exposure                                                                                                                 | Current evidence                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK     | model, embedder, reranker, image generation, speech, transcription, host cache and conversation storage                                                                                                     | model, retrieval and media are exported through `./adapters/ai-sdk`; host cache and conversation implementations remain internal | focused adapter tests, retrieval parity, exact native-contract tests and packed public-subpath smoke                                            |
| LangChain  | prompt template, model output parser, document loader, text splitter, embedder, retriever, reranker, vector store, indexer, cache store, conversation state store and key-value store                       | `retriever` is public through `./adapters/langchain`; other operations remain internal                                           | retrieval parity, fail-closed boundary tests, model schema tests, storage qualification, memory qualification and packed retriever substitution |
| LlamaIndex | prompt template, document loader, document transformer, text splitter, embedder, retriever, reranker, vector store, query engine, response synthesizer, cache store, conversation store and key-value store | `retriever` is public through `./adapters/llamaindex`; other operations remain internal                                          | retrieval parity, fail-closed boundary tests, model schema tests, storage qualification, memory qualification and packed retriever substitution |

The retrieval parity suite explicitly describes a qualified adapter parity matrix. It runs the same portable retrieval roles through AI SDK, LangChain and LlamaIndex implementations. Storage and memory suites likewise exercise LangChain and LlamaIndex alternatives against shared contracts.

### User-interface projection adapters

The package currently publishes AI SDK UI, Assistant UI, OpenAI ChatKit and NLUX adapter subpaths. These translate common interaction and conversation facts into delivery ecosystem contracts. They are selectable delivery implementations, but they are not interchangeable with model, retrieval or storage adapters merely because all are called adapters.

### Protocol adapters

A2A and MCP are public, qualified protocol surfaces. They expose different protocols rather than interchangeable implementations of one portable capability. AIFSD composes and governs them, while llm-core owns their qualified primitives and exact protocol boundaries.

### Specification-family adapters

OpenSpec, AI-SDLC, BMAD, Spec Kit and PydanticAI AgentSpec map different specification families into the shared specification journey. They are implemented and tested but not currently published. Package-owned release and cross-adapter conformance tasks already exist for this programme.

### Agent-runtime adapters

An internal PydanticAI bridge already exists under the runtime adapter area. LangGraph and Strands runtime adapters remain proposed work. The proposed runtime-substitution task explicitly intends one portable application intent to run through LangGraph and PydanticAI by changing only adapter construction.

The current PydanticAI publication task proposes a new source boundary rather than characterising the existing bridge first. That path and ownership mismatch must be reconciled before implementation.

### Integration and evidence projections

The coding-agent and OpenTelemetry projections serve integration or evidence concerns. They should not be forced into the capability-substitution catalogue unless they actually implement a portable application port.

## Public surface and qualification disposition

The package archive currently exposes only these adapter or protocol fronts:

- `./adapters/ai-sdk`
- `./adapters/catalogue`
- `./adapters/catalogue/runtime`
- `./adapters/langchain`
- `./adapters/llamaindex`
- `./adapters/ai-sdk-ui`
- `./adapters/assistant-ui`
- `./adapters/openai-chatkit`
- `./adapters/nlux-ui`
- `./a2a`
- `./mcp`

The LangChain and LlamaIndex fronts are intentionally narrow. Each exports only the qualified retriever constructor. Publishing their previous broad internal `public.ts` fronts would have implied support for operations without packed evidence, so those modules remain source-internal.

`./adapters/catalogue` exposes the frozen 67-row exact-operation portable-capability inventory plus inert candidate registration and resolution. `./adapters/catalogue/runtime` owns the separately invocable acquisition boundary. Candidate evidence is checked before resolution; an authentic accepted plan and an exact complete factory set are required before any acquisition begins. Partial acquisition uses reverse-order release.

The exact ecosystem authority windows represented by the catalogue are `ai` 7.0.37, `@langchain/core` 1.1.8, `@langchain/textsplitters` 1.0.1 and `@llamaindex/core` 0.6.22. The cache and conversation implementations under the AI SDK source boundary are classified separately as host adapters owned by `@geekist/llm-core` 2.0.0 because AI SDK 7 publishes no corresponding storage or conversation-memory contract. The packed consumer installs the LangChain and LlamaIndex optional peers without workspace or source fallback and exercises the same portable `Retriever` request and result through both public fronts.

## AIFSD's role

AIFSD should not mirror the llm-core adapter tree with one SDK wrapper per adapter. That would reproduce names without adding product semantics and would create two catalogues that can drift.

AIFSD should instead own:

- the application plan that declares required portable capabilities;
- the available qualified adapter candidates for each capability;
- explicit selection by product, host and deployment profile;
- configuration, grants, lifecycle and isolation for the selected implementations;
- integration operations where AIFSD genuinely adds application-level behaviour;
- receipts that record which exact adapter identities and support windows were selected.

llm-core should continue to own:

- portable capability contracts;
- ecosystem-native adapter factories and descriptors;
- exact support matrices and qualification evidence;
- fail-closed behaviour at each external boundary.

Selection is explicit, but it is not globally preselected. A host or deployment may provide defaults. The application contract remains portable, and another valid composition can choose a different adapter without changing product semantics.

## Simple Chat's role

Simple Chat should consume portable product capabilities rather than import a preferred ecosystem throughout its product code. Its composition root may select an AIFSD application profile containing concrete model, retrieval, storage, protocol and UI adapters.

Its own focused host and the broader AIFSD desktop host can consume the same Simple Chat product module with different host shells and, where useful, different adapter selections. Mobile hosts can use the same product contract while selecting mobile-appropriate delivery and lifecycle implementations.

The dogfood proof should be stronger than a single blessed composition. For at least one materially overlapping capability group, the same Simple Chat product behaviour should pass under two qualified adapter compositions. That proves the substitutability already intended by llm-core rather than merely asserting it in the SDK design.

## Implemented catalogue boundary and remaining direction

### 1. Closed llm-core capability-adapter catalogue

Create one machine-readable inventory whose rows bind:

- portable capability and operation;
- ecosystem and exact external authority;
- implementation entrypoint;
- support disposition and known limits;
- focused, parity and packed-consumer evidence;
- public, internal, proposed or removed disposition;
- package export and release task where applicable.

`ADAPTER_CATALOGUE` now records every implemented `CapabilityPortMap` adapter operation across AI SDK, LangChain, LlamaIndex and the host-only cache and conversation adapters as 67 exact-operation rows. This includes both host conversation ports, LlamaIndex metadata-aware splitting, both LlamaIndex key-value implementations, and operation-specific LlamaIndex vector-store limits. UI projections, protocols and specification mappings are excluded explicitly because they do not implement selectable portable capability ports. The catalogue describes exact external and implementation identity, version, operation, limits, exposure and evidence. It does not make runtime selection decisions.

### 2. LangChain and LlamaIndex public fronts

The first public fronts are retriever-only and carry packed cross-ecosystem substitution evidence. Other implemented operations remain internal until an operation-specific task adds exact-version packed evidence and intentionally widens the front.

### 3. Reconcile agent-runtime work

Inventory the existing PydanticAI bridge against the proposed PydanticAI task. Then define the common portable runtime contract and qualify PydanticAI, LangGraph and later Strands as selectable implementations where their applicable operations genuinely overlap.

### 4. Add AIFSD capability selection

Characterise an AIFSD selection contract before extending the plugin host. It should consume the llm-core catalogue or qualified descriptors, select candidates by portable capability and support requirements, and record exact decisions in the application plan.

The existing AIFSD integration-operations work should remain about real external-system application operations. It should not become a second API for every llm-core adapter.

### 5. Strengthen Simple Chat dogfood evidence

Extend the local-delivery characterisation so one product contract is exercised through explicit adapter profiles. The proof should cover more than A2A and MCP composition. Model execution, retrieval or storage are stronger substitution candidates because multiple implementations already exist.

## Accepted task disposition

Task authority now incorporates the characterisation findings without making this inventory authoritative:

1. `adapter-catalogue-public-qualification` owns the machine-readable catalogue, inert descriptor and acquisition-factory contract, public LangChain and LlamaIndex disposition, and the first packed multi-ecosystem substitution proof.
2. The existing PydanticAI bridge is evidence for, not a substitute for, the separate PydanticAI, LangGraph and Strands runtime qualification tasks.
3. AIFSD's `application-capability-composition-characterization` owns capability requirements, candidate selection, explicit profiles and deterministic application plans. It consumes llm-core descriptors rather than duplicating the catalogue.
4. AIFSD's integration-operations work remains limited to genuine external-system operations and does not mirror llm-core capability adapters.
5. The Simple Chat composition proof must exercise the same product contract under two qualified profiles for at least one materially overlapping capability.

## Evidence snapshot

The focused current adapter evidence was run against the working tree:

```text
bun test packages/llm-core/tests/retrieval/parity-matrix.test.ts \
  packages/llm-core/tests/retrieval/fail-closed-boundaries.test.ts \
  packages/llm-core/tests/storage/qualified-adapters.test.ts \
  packages/llm-core/tests/memory/qualified-adapters.test.ts \
  packages/llm-core/tests/model/schema-resolution.test.ts

28 passed, 0 failed, 151 assertions
```

The adapter source estate is approximately 15,268 physical lines at this snapshot. That size reinforces the need for an explicit catalogue and disposition review before introducing another exposure layer.

The public qualification implementation adds 67 frozen exact-operation catalogue rows, two packed retriever fronts, inert candidate resolution and exact post-acceptance acquisition. The task-owned focused matrix enumerates every implementation, export and operation rather than relying on a row count alone, and covers catalogue closure, candidate authenticity, zero-call preflight failures, rollback and packed substitution before the full release gate.

## Non-claims

This inventory does not claim that every implementation is semantically interchangeable for every operation, that every internal adapter is release-ready, or that one ecosystem can replace another without capability-specific support checks.

Interchangeability is operation-scoped. A candidate is selectable only where its exact support contract satisfies the application's required operation and authority window.
