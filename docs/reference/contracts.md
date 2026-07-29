# Contract catalogue

This catalogue points to the portable shapes exported from
`@geekist/llm-core/contracts`. For the design rules behind them, start with
[Contracts and portability](/capabilities/contracts).

## Identity

| Contract                      | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `CoreId` and branded core IDs | Canonical RFC UUID strings. Newly minted core identities use UUIDv7.                |
| `ExternalId`                  | Bounded printable identity issued outside core. It does not acquire UUID semantics. |
| `TraceId` and `SpanId`        | W3C observability identity, kept separate from correlation and invocation identity. |
| `SecretRef`                   | Opaque reference to a credential. The credential value is not portable.             |

## Invocation

`InvocationContext` carries portable execution facts through capability ports:

- invocation, run, step, and correlation identity;
- principal, tenant, trace, deadline, and budget;
- opaque secret references.

Live handles, event sinks, provider clients, and generic extension escape
hatches remain outside the context.

## Versioning and schemas

| Contract                | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `ContractVersion`       | Strict semantic version for a portable contract.                                  |
| `ContentDigest`         | Algorithm-qualified SHA-256 digest.                                               |
| `SchemaRef`             | Stable schema identity, version, and digest.                                      |
| `CapabilityClaim`       | Evidence-backed statement about one supported, conditional, or failed capability. |
| `CapabilityRequirement` | Requirement used during deterministic binding resolution.                         |

The checked JSON Schema is generated from the TypeScript contract source. A
schema reference binds consumers to the exact serialized schema bytes.

## Portable content

The closed content union represents:

- text;
- JSON;
- inline binary content with media type, byte length, and digest;
- resource references with identity, media type, byte length, and digest.

Physical paths, signed URLs, buckets, credentials, and live resolver objects do
not enter portable content. Byte access occurs through an explicit live port.

## Extensions

Contracts that expose an extensions field use lowercase reverse-DNS keys and
finite JSON-compatible values. Compliant handlers preserve unknown entries
through round-trips.

An extension field does not by itself prove redaction. Evidence that contains
provider-native observations uses the stricter
`RedactedNativeExtensions` boundary from `@geekist/llm-core/evidence`.

## Generated schema

The package publishes its generated contract schema and verifies the committed
document during typecheck and CI. Use [Package exports](/reference/package-exports)
for the module surface and [API by subpath](/reference/api) for the owning
capability of each higher-level contract.
