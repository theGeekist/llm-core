# ADR-003 — Schema Authority, Identity and Native Extensions

Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-100, P0-110, P0-120, P0-130
Supersedes: none

## Context

Cross-language runtimes require JSON-compatible wire contracts, stable
identities, schema versions and lossless native payload preservation.

## Decision

### Schema authority

- Constrained TypeScript under `src/contracts` is the authoring authority.
- Exact-pinned `ts-json-schema-generator` produces checked-in JSON Schema Draft
  7 bundles through a dedicated contracts tsconfig.
- Clean regeneration is deterministic and CI fails on a diff.
- Generated roots are named exports; tuples are strict, functions fail,
  type-checking and JSDoc are enabled, and objects are closed unless they
  explicitly declare an extension map.
- Allowed wire types are named interfaces/aliases, JSON primitives, literals,
  arrays, fixed tuples, optional properties, named references, JSON-valued
  records, and closed discriminated unions with required `kind`.
- Wire contracts exclude `undefined`, `bigint`, symbols, functions, classes,
  dates, URLs, maps, sets, promises, live handles, buffers, conditional/mapped
  types, untagged unions, and unconstrained `unknown`/`any`.
- Brands are compile-time overlays erased to their documented string schemas.

`SchemaRef` contains a stable absolute `schemaId`, SemVer `version`, and a
SHA-256 digest of the exact published schema bytes.

### Identity

- Every portable ID is a JSON string with an opaque TypeScript brand.
- Core-owned invocation, run, step, tool-call, conversation, durable-job,
  event, resource, and evidence IDs use canonical lowercase RFC 9562 UUID
  strings; new values are UUIDv7.
- Provider-session, principal, and tenant IDs remain opaque externally issued
  strings of 1–255 printable non-whitespace ASCII characters.
- `CorrelationId` is opaque and is not a trace ID. W3C trace and span IDs use
  their canonical lowercase hexadecimal wire forms.

### Portable content and resources

The mandatory closed content union contains:

- `{ kind: "text", text }`;
- `{ kind: "json", value, schema? }`;
- `{ kind: "binary", mediaType, encoding: "base64", data, byteLength, digest }`;
- `{ kind: "media-ref", mediaType, resource, altText? }`.

P0 digests use SHA-256 with lowercase hexadecimal values. Binary length and
digest describe decoded bytes.

`ResourceRef` contains `resourceId`, `mediaType`, `byteLength`, and digest. A
resolver port maps it to bytes. Portable data never contains paths, signed
URLs, buckets, database keys, credentials, or provider handles.

Tool calls/results remain execution contracts rather than generic content.
Reasoning, citations, refusals, and provider-native parts are optional feature
contracts or namespaced extensions.

### Evidence, redaction, and extensions

`EvidenceRef` contains:

- `evidenceId`;
- a closed evidence kind;
- a `ResourceRef` named `content`; and
- an optional `SchemaRef`.

Evidence references contain no physical locator or secret and resolve only
through an authorized storage-neutral evidence port. Events record explicit
redaction metadata and may carry an authorized evidence reference; the
reference never implies disclosure permission.

`extensions` is an optional `Record<string, JsonValue>` keyed by lowercase
reverse-DNS namespaces. Unknown entries survive decode, persistence,
forwarding, and re-encoding unchanged.

Live contracts are explicitly marked and excluded from generation. Secrets are
opaque references and never content, evidence, or canonical event payloads.

## Rejected alternatives

- Zod as contract authority; it remains acceptable at adapter/application
  edges, but its runtime conversion semantics do not define the cross-language
  ABI.
- Hand-authored schema as the P0 authority.
- Unchecked TypeScript-only contracts.
- A catch-all portable `raw: unknown` content variant.
- Physical storage locators inside resource or evidence references.

## Verification implications

Contract fixtures must round-trip JSON and preserve unknown namespaced
extensions.
