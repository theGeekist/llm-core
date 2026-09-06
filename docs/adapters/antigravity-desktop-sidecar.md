# Antigravity Desktop Sidecar adapter

The Antigravity Desktop Sidecar adapter connects `llm-core` to the supervised Antigravity Desktop Sidecar environment through its provider-injected `agentapi` CLI interface. The runtime is pinned to host Antigravity Desktop `2.11.0` (with minimum qualified host `2.8.1`) and Sidecar contract version `1.1.27`. The adapter remains internal until publication work adds a supported package export.

Applications supply execution through `AntigravityDesktopSidecarClient`, which interacts with the supervised sidecar process via `newConversation`, `sendMessage`, and `inspectConversation`. The adapter requires an explicit injected client and does not inspect host processes, ambient configuration, or system PATH directly.

The client carries the exact Desktop, Sidecar contract, and runtime identity tuple. Construction fails when it does not match the qualified source contract. Because `agentapi` exposes addressable ingress without terminal output or model observation, accepted start and idle-continuation commands retain the native conversation reference but end the portable run as `provider-unobservable`. The adapter does not invent output or successful model completion.

## Portable operations

| Portable operation | Antigravity Desktop Sidecar `1.1.27` route | Disposition |
| --- | --- | --- |
| `conversation.start` | `agentapi new-conversation` | supported |
| `conversation.continue` | `agentapi send-message` (idle conversation) | supported |
| `run.observe` | No continuous event stream | unsupported, `observability-insufficient` |
| `run.input.submit` | `agentapi send-message` (busy turn) | unsupported, `qualification-failed` |
| `run.cancel` | No qualified cancellation route | unsupported, `qualification-failed` |

## Three-way runtime identity

The runtime records three separate system identities:

1. **Desktop App**: Google Antigravity Desktop application host (bundle `com.google.antigravity`, host version `2.11.0`, qualified version `2.8.1`).
2. **Sidecar process**: Supervised daemon process (`simple-chat-qualification`, `restartPolicy: never`).
3. **agentapi**: Provider-injected CLI binary placed on the sidecar child environment PATH (`/usr/local/bin/agentapi`).

The route profile ID is `antigravity.desktop-sidecar.agentapi`, maintaining strict separation from CLI hook route `antigravity.cli-hooks.execution-boundary`.

## Idle addressability vs busy-turn timing probe

The adapter includes a bounded probe (`runAntigravityDesktopSidecarProbe`) that distinguishes idle addressability from busy-turn timing:

- **Idle addressability**: Qualified through an observed idle state and an accepted ingress command. Recipient observation remains unobservable and semantic processing remains untested.
- **Busy-turn timing**: Provider accepts ingress `sendMessage` commands while a turn is active, but recipient model observation is unproven (`unobservable`). The provider exhibits no verifiable causation between busy-turn ingress and current turn generation. Neither `native-live` nor `execution-boundary` delivery mode is claimed.
- Active input submission returns `unsupported` without invoking native ingress. `activeInputEvidence` yields `status: "unavailable"` with `reasonCode: "provider-unobservable"`.

## Boundaries and negative outcomes

- **Idle continuation fencing**: A continuation requires native `idle` state and a local single-flight reservation for its conversation ID.
- **Configuration errors**: Disabled sidecar configurations or missing project IDs fail gracefully as `AntigravitySidecarConfigurationError` with `disabledConfiguration` or `missingProjectId`.
- **Process errors**: Absent sidecar processes, process crashes, or missing `agentapi` binaries fail cleanly as `AntigravitySidecarProcessError` with `absentProcess`, `processCrash`, or `unavailableAgentApi`.
- **Stale conversations**: Rejection by the sidecar during continuation raises `AntigravityStaleConversationError` with the stale conversation ID.
- **Portable failures**: Native error prose is mapped to closed reason codes and is not copied into portable results or events.
- **Controlled effects**: The adapter reports `controlledEffects: false`, `interventions: false`, and `cancellation: "none"`.
