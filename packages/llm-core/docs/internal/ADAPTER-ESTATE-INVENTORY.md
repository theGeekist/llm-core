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

| Ecosystem  | Implemented capabilities                                                                                                                                                                                    | Current exposure                                                                                                                 | Current evidence                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AI SDK     | model, embedder, reranker, image generation, speech, transcription, host cache and conversation storage                                                                                                     | model, retrieval and media are exported through `./adapters/ai-sdk`; host cache and conversation implementations remain internal | focused adapter tests, retrieval parity, exact native-contract tests and packed public-subpath smoke             |
| LangChain  | prompt template, model output parser, document loader, text splitter, embedder, retriever, reranker, vector store, indexer, cache store, conversation state store and key-value store                       | internal                                                                                                                         | retrieval parity, fail-closed boundary tests, model schema tests, storage qualification and memory qualification |
| LlamaIndex | prompt template, document loader, document transformer, text splitter, embedder, retriever, reranker, vector store, query engine, response synthesizer, cache store, conversation store and key-value store | internal                                                                                                                         | retrieval parity, fail-closed boundary tests, model schema tests, storage qualification and memory qualification |

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

## Public surface and qualification gap

The package archive currently exposes only these adapter or protocol fronts:

- `./adapters/ai-sdk`
- `./adapters/ai-sdk-ui`
- `./adapters/assistant-ui`
- `./adapters/openai-chatkit`
- `./adapters/nlux-ui`
- `./a2a`
- `./mcp`

The build entrypoints and packed smoke match that list. LangChain and LlamaIndex implementations are therefore real, tested internal capability alternatives, but a package consumer cannot select them through supported package exports.

This is the central estate gap. Implementation parity, package exposure, exact ecosystem qualification and public support are separate states. The current repository has meaningful implementation and test evidence, but it has not yet made a complete public-support decision for the adapter estate.

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

## Direction to characterise before implementation

### 1. Close the llm-core adapter catalogue

Create one machine-readable inventory whose rows bind:

- portable capability and operation;
- ecosystem and exact external authority;
- implementation entrypoint;
- support disposition and known limits;
- focused, parity and packed-consumer evidence;
- public, internal, proposed or removed disposition;
- package export and release task where applicable.

The catalogue should describe evidence. It must not make runtime selection decisions.

### 2. Decide the LangChain and LlamaIndex public fronts

Characterise the existing implementations before adding more adapters. Decide which capability groups are coherent public subpaths, which need further exact-version fixtures, and which should remain internal. Qualification can be coordinated at package level while retaining evidence per ecosystem and capability.

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

## Non-claims

This inventory does not claim that every implementation is semantically interchangeable for every operation, that every internal adapter is release-ready, or that one ecosystem can replace another without capability-specific support checks.

Interchangeability is operation-scoped. A candidate is selectable only where its exact support contract satisfies the application's required operation and authority window.
