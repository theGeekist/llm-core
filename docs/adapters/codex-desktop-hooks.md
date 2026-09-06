# Codex Desktop hooks

The Codex Desktop hook bridge is qualified against ChatGPT Desktop `26.901.31953` and its bundled Codex runtime `0.153.1`. It is a separate route from the coordinator-owned Codex app-server adapter.

The bridge binds application-admitted active input to one portable run, native session, and native turn. A composition-owned inbox atomically claims that exact tuple. `PreToolUse`, `PostToolUse`, and `UserPromptSubmit` prepare the native `additionalContext` output. `Stop` prepares `decision: "block"` with a continuation reason. `stop_hook_active` fences recursive continuation; messages encountered there are reported as refused rather than retained for a later unrelated turn.

## Support matrix

| Operation | Disposition | Evidence |
| --- | --- | --- |
| `conversation.start` | unsupported | Hooks do not start a provider conversation. |
| `conversation.continue` | unsupported | Hooks do not wake a fully idle task. |
| `run.observe` | unsupported | Lifecycle checkpoints do not form a complete native run stream. |
| `run.input.submit` | supported, execution boundary | Native context injection and Stop continuation are version pinned. |
| `run.cancel` | unsupported | Hook continuation and context output are not cancellation. |

The inbox resolves submission as accepted only after composition has written the prepared output to the native hook stdout successfully. The prepared result therefore exposes explicit `commit` and `release` finalisation. Write failure releases the claim for redelivery. Projected output still does not prove that the recipient observed or semantically processed it. Applications retain durable storage, authority, retries, routing, and atomic single-writer claims.

The exact live probe qualified `PostToolUse`: while an eight-second Bash command was active, the external nonce `CODEX_HOOK_ACTIVE_20260905` was queued. The command completed normally, the hook received the matching session and turn, and Codex returned the nonce in that turn. Other boundaries currently have contract fixtures rather than separate live observations.

The adapter exposes no private Desktop process handle, embedded app-server transport, transcript parser, scheduler, or shared-store implementation. The native `transcript_path` is deliberately excluded because the current hook contract does not treat its format as stable.
