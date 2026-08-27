---
id: language-audit
title: Public language findings and journey contract
stage: language
status: done
priority: critical
depends_on:
  - capabilities-context-artifacts
  - capabilities-evaluation
  - capabilities-runtime-conformance
decision_dependencies:
  - ADR-001
conflicts_with: []
write_scope:
  - packages/llm-core/docs/final-architecture/LANGUAGE.md
  - packages/llm-core/docs/final-architecture/tasks/language-audit.md
required_reading:
  - path: docs/reference/vocabulary.md
    reason: "Use the public vocabulary evidence produced from the audit findings."
  - path: packages/llm-core/docs/v1-developer.md
    reason: "Identify internal lifecycle language that escaped into the pre-v2 public surface."
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
read_scope:
  - docs/reference/vocabulary.md
  - packages/llm-core/docs/v1-developer.md
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - packages/llm-core/README.md
  - docs/**
review_owner: coordinator
updated_at: 2026-07-31
---

# language-audit — Public language findings and journey contract

## Objective

Audit the complete public language surface and define the five ordinary usage
journeys before another capability adds public vocabulary.

## Acceptance criteria

- Every current package subpath is assessed.
- Exports are classified as common, extension or internal.
- Agent, tool, workflow, conversation and specification journeys are written
  before exact type names are selected.
- Findings distinguish API complexity from necessary implementation rigor.
- Current industry vocabulary and the local framework profiles inform the
  direction without making one framework canonical.

## Verification

```sh
bun run --cwd packages/llm-core format:check
```

## Work log

- 2026-07-30 — Three parallel audits reviewed common journeys, advanced
  capability surfaces and the proposed specification layer.
- 2026-07-30 — Coordinator synthesized the findings into `LANGUAGE.md`.

## Handoff

The findings passed independent review and were integrated at `b87116c`.
`language-vocabulary` owns the exact replacement map and desired public API
journey fixtures.
