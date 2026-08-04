# v2 documentation information architecture

This map follows the dependency direction of the shipped package:

```text
contracts → capabilities → application orchestration → adapters and delivery
```

The sidebar introduces concepts in that order. A published page describes a
real export or a reader task. Historical v1 pages are source material, not
navigation commitments.

## Navigation

### Guide

1. Get started
2. Core concepts
3. Integrate an agent runtime
4. Describe workflow intent
5. Project an interaction
6. Why llm-core
7. Migrate from 1.x

### Capabilities

1. Overview
2. Contracts and portability
3. Model and media
4. Tools
5. Control
6. Evidence
7. State and durability
8. Context
9. Artifacts
10. Evaluation
11. Agent capabilities
    - Bindings and composition
    - Agent skills
    - Retrieval and indexing
    - Storage and memory

Retrieval, indexing, storage, memory, and media are independent feature fronts
published at `/retrieval`, `/indexing`, `/storage`, `/memory`, and `/media`.
Agent and model contracts refer to their portable values without absorbing
their live capability ports.

### Orchestration

1. Overview
2. Workflows
3. Controlled tool execution
4. Composition patterns

### Interaction

1. Overview
2. Events and projections
3. Sessions
4. Reconnect and transport

### Adapters

1. Overview
2. AI SDK model
3. UI projections
4. Runtime conformance

### Reference

1. Vocabulary
2. API by subpath
3. Contract catalogue
4. Functional helpers
5. Failures and diagnostics
6. Package exports
7. Packaging and conformance
8. Design decisions
9. Migrate from 1.x to 2.0

## Page rules

- One explanatory page per independent exported capability when its guarantees
  need room. Avoid pairings such as Tools and Control or Evidence and State.
- A guide answers a reader task. A capability page explains a contract and its
  guarantees. A reference page lists exact shapes and names.
- Keep application sequencing under Orchestration. Features do not appear to
  coordinate one another directly.
- Keep adapter-native types at the edge of every diagram and example.
- The migration page is the only place where deleted names dominate the prose.

## Visual map

| Page          | Preferred visual                                       |
| ------------- | ------------------------------------------------------ |
| Core concepts | dependency flow and separate agent/workflow lifecycles |
| Contracts     | portable/live boundary                                 |
| Control       | control-contract relationship                          |
| State         | lifetime taxonomy                                      |
| Context       | selection and provenance flow                          |
| Artifacts     | output provenance flow                                 |
| Evaluation    | evidence-binding graph                                 |
| Agent guide   | application/adapter/native runtime sequence            |
| Workflow      | intent/projection/native ownership boundary            |
| Interaction   | event projection sequence                              |
| Adapters      | native-to-neutral boundary                             |

Vocabulary, package exports, and migration use tables instead of diagrams.
