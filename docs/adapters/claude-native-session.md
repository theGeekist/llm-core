# Claude native session adapter

The Claude adapter exposes two route profiles because Claude Code cross-session messaging and Channels have different lifecycle and evidence contracts.

## Cross-session inbox

`claude.cross-session.inbox` is pinned to Claude Code `2.1.261`. The application composition owns the Claude process; the package receives that capability through `ClaudeNativeSessionClient`. Provider session IDs stay opaque and separate from portable run IDs.

The CLI process starts with print mode, verbose `stream-json` output and hook events. Continuation passes the exact provider session through Claude's `--resume` contract. The adapter recognises the pinned native `system`, `assistant` and `result` records. Every valid native record is also passed, in order and with extension data intact, to a composition-owned observer before portable projection. The observer owns redaction and any provider-native storage. The adapter fails closed on malformed records, process loss, init or terminal session identity drift, native terminal error markers and rejected output projection.

Claude documents per-session inbox delivery between tool calls during an active turn and a new turn while idle, which is `native-live` timing under ADR-018. The advertised operation remains `unsupported/qualification-failed` until that active-turn timing and the delivered, held and refused outcomes are reproduced against the pinned host release. The runner returns an explicit unsupported acknowledgement and does not open or write an inbox socket.

Cancellation remains `unsupported/qualification-failed` until the concrete process supervisor passes a live cancellation probe. The runner returns an explicit unsupported acknowledgement and does not invoke process cancellation.

The source contract is Anthropic's current [cross-session messaging reference](https://code.claude.com/docs/en/cross-session-messaging). It documents macOS and Linux Unix-domain inboxes, the exported socket and token, receiver-controlled delivered, held and refused outcomes, `claude -p` support, and the active versus idle delivery timing.

## Channels research preview

`claude.channel.research-preview` is deliberately separate. A Channel is an opted-in MCP server that emits `notifications/claude/channel` while the session is open. The notification call confirms only that the event was written to the transport. Claude Code can silently drop it when the Channel was not admitted or organisation policy blocks it, so this profile does not claim portable `run.input.submit` support. Start, continuation, run observation and cancellation are not Channel operations.

The source contract is Anthropic's current [Channels reference](https://code.claude.com/docs/en/channels-reference).

## Qualification

The host probe on 2026-09-05 used the native Claude Code `2.1.261` executable, commit `1349cf9c224c`, on macOS arm64. It observed an exact caller-supplied session ID, an inbox socket path, `system/init`, `assistant` content and a successful terminal `result` through verbose `stream-json`. `claude doctor` reported no installation issues after stale repository-local `agmsg` hooks were removed.

Deterministic fixtures cover start, continuation, missing or drifting init identity, terminal identity drift, native terminal failures, redaction, malformed output, process loss, ordered native extension observation, and explicit unsupported input and cancellation. Start, continuation and observation are advertised as supported. A live start and exact-session `--resume` probe passed against the pinned host release. Input and cancellation remain explicitly unsupported pending the live gates above. The injected client remains responsible for the host-specific process implementation.
