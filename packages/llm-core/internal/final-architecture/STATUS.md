# llm-core Architecture v2 Status

Architecture version: v2
Updated: 30 July 2026
Active tasks: 0

This is a projection. Task files under [`tasks/`](tasks/) are authoritative.
Swarm claiming and integration follow [`COORDINATION.md`](COORDINATION.md).

| ID     | Phase | Status   | Planned swarm | Owner                     | Depends on                        |
| ------ | ----- | -------- | ------------- | ------------------------- | --------------------------------- |
| A0-001 | A0    | done     | coordinator   | architecture-coordinator  | —                                 |
| I0-010 | I0    | complete | historical    | Claude Code               | —                                 |
| P0-100 | P0.1  | complete | Codex         | codex-root                | A0-001                            |
| P0-110 | P0.2  | complete | Codex         | codex-root                | P0-100                            |
| P0-120 | P0.2  | complete | historical    | Claude Code               | P0-100                            |
| P0-130 | P0.3  | complete | Codex         | codex-root                | P0-110                            |
| P0-140 | P0.3  | complete | Codex         | codex-root                | P0-110, P0-120, P0-130            |
| P0-141 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-160            |
| P0-142 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-130, P0-160    |
| P0-143 | P0.3  | complete | Codex         | codex-root                | P0-100, P0-120, P0-140, P0-160    |
| P0-149 | P0.4  | complete | Codex         | codex-root                | P0-141, P0-142, P0-143            |
| P0-155 | P0.4  | complete | Codex         | codex-root                | P0-110, P0-120                    |
| P0-160 | P0.4  | complete | Codex         | codex-root                | P0-110, P0-120, P0-155            |
| P0-170 | P0.4  | complete | Codex         | codex-root                | P0-130, P0-140, P0-160            |
| P0-150 | P0.5  | complete | coordinator   | codex-root                | I0-010, P0-149, P0-170            |
| P1-210 | P1.1  | complete | Codex         | codex-context-artifacts   | P0-150                            |
| P1-220 | P1.1  | complete | Codex         | codex-evaluation-domain   | P0-150, P1-210                    |
| P1-230 | P1.2  | complete | Codex         | codex-conformance-runtime | P0-150, P0-160, P0-170            |
| P2-300 | P2.1  | ready    | coordinator   | —                         | P1-210, P1-230, ADR-009           |
| P2-310 | P2.2  | blocked  | coordinator   | —                         | P2-300, WPKERNEL-PIPELINE-RELEASE |
| P2-315 | P2.2  | proposed | coordinator   | —                         | P2-310                            |
| P2-320 | P2.3  | proposed | coordinator   | —                         | P2-315                            |
| X1-400 | X1    | proposed | Codex         | —                         | P2-320                            |
| X1-405 | X1    | proposed | coordinator   | —                         | X1-400, ADR-010                   |
| X1-410 | X1    | proposed | Codex         | —                         | P2-320                            |
| X1-415 | X1    | proposed | coordinator   | —                         | X1-410, ADR-010                   |
| X1-420 | X1    | proposed | Codex         | —                         | P2-320                            |
| X1-425 | X1    | proposed | coordinator   | —                         | X1-420, ADR-010                   |
| X1-430 | X1    | proposed | Codex         | —                         | P2-320                            |
| X1-435 | X1    | proposed | coordinator   | —                         | X1-430, ADR-010                   |
| X1-440 | X1    | proposed | Codex         | —                         | P2-320                            |
| X1-445 | X1    | proposed | coordinator   | —                         | X1-440, ADR-010                   |

## Next action

Complete P2-300's canonical graph and conversion contracts. P2-310 may begin
after those contracts pass review and WPKernel publishes a forward exact
Pipeline version. Phases 1 through 6, including typed custom stages, are already
implemented and packed-qualified; version reconciliation and release are the
remaining external blocker. The current verified release baseline remains the
19-front package surface until P2-320 publishes and verifies the twentieth
`./specifications` front.
