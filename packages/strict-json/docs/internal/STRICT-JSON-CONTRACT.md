# Strict JSON contract

## Purpose

`@geekist/strict-json` is the consumer-neutral JSON boundary beneath
`@geekist/llm-core` and `@aifsd/sdk`. Its public API is intentionally limited to
strict JSON values, canonical bytes, detached frozen snapshots and the
record mechanics needed to validate closed data shapes.

## Accepted values

A strict JSON value is `null`, a boolean, a Unicode scalar string, a finite number,
a dense array of strict JSON values, or an ordinary or null-prototype record whose
own properties are enumerable string-keyed data properties containing strict JSON
values.

Integers outside JavaScript's safe range are rejected. Negative zero is
normalised to zero. Repeated acyclic references are accepted and independently
detached. Cycles are rejected.

The boundary rejects `undefined`, `bigint`, symbols, functions, accessors,
non-enumerable properties, symbol keys, sparse or extended arrays, class
instances, dates, maps, sets and other live objects.

## Hostile inspection

Input methods are never called. Inspection uses prototype, key and descriptor
operations and reads only descriptor values. Those reflection operations can
still trigger Proxy traps. Any trap failure is converted to the stable
`inspection-failed` reason without exposing the native error text. The package
does not claim that arbitrary Proxy inspection is side-effect-free.

## Canonicalisation

The package owns admission, normalisation and serialization. Runtime
serialization uses only the package-owned detached graph and does not invoke
inherited array methods or `toJSON`. `canonicalize@3.0.0` remains pinned as a
development parity oracle for accepted values; its permissive arbitrary-input
behaviour is not part of this package's contract.

## Snapshots and freezing

`snapshot` normalises into a detached graph, recursively freezes it and returns
the public `FrozenJsonValue` type. `deepFreeze` preserves the input shape while
exposing it as deeply readonly.
`deepFreeze` is for already-valid `JsonValue` graphs and walks descriptor values
so it never invokes accessors. Its pre-order freeze and identity-based visitation
guard terminate on repeated references and accidental cycles, while still
traversing descendants of containers that were already frozen.

No generic `cloneFrozen<T>`, result abstraction, timestamp validator, digest
contract, retry helper, filesystem helper or error base class belongs here.

## Dependency rule

This package never imports `@geekist/llm-core` or `@aifsd/sdk`. Both are
downstream consumers. OSS types do not escape the public API.
