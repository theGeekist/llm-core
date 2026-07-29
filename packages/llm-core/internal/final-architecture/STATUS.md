# llm-core Architecture v2 Status

Architecture version: v2
Updated: 30 July 2026
Active tasks: 1

This is a projection. Task files under [`tasks/`](tasks/) are authoritative.
Swarm claiming and integration follow [`COORDINATION.md`](COORDINATION.md).

| ID     | Phase | Status   | Planned swarm | Owner                     | Depends on                     |
| ------ | ----- | -------- | ------------- | ------------------------- | ------------------------------ |
| A0-001 | A0    | done     | coordinator   | architecture-coordinator  | —                              |
| I0-010 | I0    | complete | historical    | Claude Code               | —                              |
| P0-100 | P0.1  | complete | Codex         | codex-root                | A0-001                         |
| P0-110 | P0.2  | complete | Codex         | codex-root                | P0-100                         |
| P0-120 | P0.2  | complete | historical    | Claude Code               | P0-100                         |
| P0-130 | P0.3  | complete | Codex         | codex-root                | P0-110                         |
| P0-140 | P0.3  | complete | Codex         | codex-root                | P0-110, P0-120, P0-130         |
| P0-141 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-160         |
| P0-142 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-130, P0-160 |
| P0-143 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-140, P0-160 |
| P0-149 | P0.4  | complete | Codex         | codex-root                | P0-141, P0-142, P0-143         |
| P0-155 | P0.4  | complete | Codex         | codex-root                | P0-110, P0-120                 |
| P0-160 | P0.4  | complete | Codex         | codex-root                | P0-110, P0-120, P0-155         |
| P0-170 | P0.4  | complete | Codex         | codex-root                | P0-130, P0-140, P0-160         |
| P0-150 | P0.5  | complete | coordinator   | codex-root                | I0-010, P0-149, P0-170         |
| P1-210 | P1.1  | complete | Codex         | codex-context-artifacts   | P0-150                         |
| P1-220 | P1.1  | ready    | Codex         | —                         | P0-150, P1-210                 |
| P1-230 | P1.2  | claimed  | Codex         | codex-conformance-runtime | P0-150, P0-160, P0-170         |

## Next action

Finish independent review of P1-230 and claim P1-220 from the integrated
context/artifact baseline. PydanticAI remains the selected first Python
reference runtime.
