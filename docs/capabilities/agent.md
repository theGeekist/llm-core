# Agent contracts

The agent capability defines portable intent and normalized execution facts:

- `AgentDefinition` identifies instructions, effect requirements, metadata, and skill references;
- `AgentRunner` is implemented by a qualified runtime integration;
- `PreparedAgentDefinition` records preparation by one runner;
- `AgentRun` exposes events, result, cancellation, and intervention controls;
- `AgentResult` reports one terminal status and optional native references.

<<< @/snippets/v2/agent-capabilities.ts

Preparation by one runner does not authorize use by another. Resume remains runner-owned and compatibility-gated. The kernel supplies no concrete runner.
