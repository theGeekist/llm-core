# @aifsd/strict-json

Strict JSON normalisation, canonicalisation, snapshots, and freezing.

This package owns the small data-boundary contract shared by `@geekist/llm-core` and `@aifsd/sdk`. It does not own AI contracts, configuration policy, retry, telemetry, paths, adapter state machines, or general-purpose utilities.

```sh
npm install @aifsd/strict-json
```

```ts
import { canonicalize, snapshot } from "@aifsd/strict-json";

const captured = snapshot({ z: -0, a: [3, 2, 1] });
const identity = canonicalize(captured);
```

The accepted grammar is stricter than ordinary JavaScript JSON serialization: unsafe integers, non-finite numbers, lone surrogates, sparse or extended arrays, accessors, symbol keys, exotic prototypes, cycles and non-JSON values are rejected. See [the contract](./docs/internal/STRICT-JSON-CONTRACT.md).
