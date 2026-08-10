# OpenHands coding-agent qualification

This characterisation selects OpenHands Software Agent SDK 1.37.1 at research revision `310989d306114efd0fcadbcbed9ff9c21d4a5963`. The executable Python requirement is exactly `openhands-sdk==1.37.1`. Later OpenHands releases are unsupported until independently qualified.

The selection follows a comparison with Claude Agent SDK 0.2.128 and its bundled Claude Code 2.1.220 runtime. Claude provides a strong coding harness, but an exact claim has to bind two coupled release trains, an opaque executable, permission-precedence behaviour and best-effort transcript mirroring. OpenHands 1.37.1 exposes the inspected event, workspace and conversation boundaries directly and already has an exact AIFSD native-event precedent. This is a choice for the current fixture, not a universal coding-agent preference.

## Qualified boundary

OpenHands owns execution, workspace state, the native event tree, `ConversationState`, cancellation and resume semantics. `llm-core` does not rebuild or reinterpret those contracts. The adapter accepts an exact-version qualification observation, validates a closed permission and workspace boundary, and emits only normalized identities, digests, byte lengths and ownership facts. Raw native events and repository contents do not cross into portable evidence.

The governed fixture uses a temporary OpenHands `LocalWorkspace` with an explicit grant for `workspace.read`, `workspace.write`, the isolated `python` qualification process and `repository.write`. A macOS `sandbox-exec` profile restricts reads and writes to the qualification workspace, the pinned interpreter and dependency environment, the probe, lockfile and required system paths. Network egress is denied. The executor constructs an environment allowlist instead of inheriting the host environment, and the native probe executes negative checks for host-file reads, host-file writes, network connections and credential variables.

The executable subject is CPython 3.12.12 on Darwin arm64, the lockfile digest, the native-probe digest and the canonical identity of all 125 installed distributions. Evidence is rejected if any part of that closure differs. The Python probe performs native file upload and download round trips and constructs and round-trips two real OpenHands `MessageEvent` values. The TypeScript boundary parses those exact serialised events, correlates their native type, source, role, sequence, identifier, timestamp and governed text, then projects the repository before-state, after-state and patch as content-addressed evidence.

The exact release resolves a relative `file_upload` destination against the host process directory rather than the workspace working directory. The fixture therefore supplies an absolute destination already confined beneath its temporary workspace. The portable projection accepts only the governed POSIX-relative logical path and never exposes that physical path.

| Operation | Disposition | Evidence |
| --- | --- | --- |
| `native.openhands.message-event-round-trip` | supported | Exact Python probe using `openhands-sdk==1.37.1` |
| `portable.coding-agent.repository-change-evidence` | supported | Governed repository-change projection fixture |
| `native.openhands.local-workspace-file-round-trip` | supported | Exact `LocalWorkspace` upload and download fixture |
| `native.openhands.agent-loop-execution` | unsupported | The fixture does not execute or replace the native loop |
| `native.openhands.live-cancellation` | unsupported | Upstream semantics remain native and are not exercised |
| `native.openhands.session-resume` | unsupported | `ConversationState` and the event tree remain integration-owned |
| `native.openhands.distributed-workflow-durability` | unsupported | OpenHands persistence is not a distributed workflow guarantee |

No operation is classified as supported through semantic loss. Unsupported native operations fail as unsupported rather than returning narrowed portable substitutes.

## Verification

```sh
UV_PROJECT_ENVIRONMENT=/private/tmp/llm-core-coding-agent-qualification-venv uv sync --frozen --project apps/coding-agent-qualification
OPENHANDS_QUALIFICATION_PYTHON=/private/tmp/llm-core-coding-agent-qualification-venv/bin/python bun test apps/coding-agent-qualification packages/llm-core/tests/adapters/coding-agent
bun run docs:check
bun run check:sloc
```

This characterisation does not add a package export or approve publication. A published adapter would require a separate exact-version support and maintenance decision.
