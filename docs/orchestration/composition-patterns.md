# Composition patterns

Compose capabilities in the host application, AIFSD toolchain, or runtime adapter that owns the use case. Keep `llm-core` focused on portable contracts, authority, evidence, and conformance.

Use explicit construction:

```text
portable intent + reviewed authority
  -> selected target adapter
  -> native runtime definition
  -> selected runner
  -> normalized events and evidence
```

Avoid service locators, hidden default runners, and kernel-owned workflow registries. A composition root may select integrations, credentials, stores, policies, and transports without making those choices portable contracts.
