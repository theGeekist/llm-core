# Contracts and portability

A **contract** is the typed shape at the boundary between your logic and
everything it talks to: models, tools, runners, storage, and UIs. Contracts are
the stable vocabulary the rest of the system is built on, so this page describes
what makes one portable and why that matters.

## Portable means JSON-compatible

Every portable value is JSON-compatible. You can serialize it, store it, send it
across a process or a language boundary, and read it back later with its meaning
intact. That is what lets the same run cross a browser, a server, and a second
runtime without a shared object graph.

Portable contracts therefore exclude anything that only makes sense in one
process: live handles, functions, class instances, dates, URLs, maps, sets, and
unconstrained `unknown`. A value that must hold something running now is a **live**
value, such as a [`LiveContinuation`](/reference/vocabulary), and it stays in
memory rather than entering a portable field.

## Identity is an opaque string

Every portable ID is a JSON string with a compile-time brand, so the type system
keeps a run ID and a tool-call ID apart even though both are strings. Core-owned
IDs (invocation, run, step, tool call, event, and the rest) are UUIDs, and new
ones are time-ordered UUIDv7. A `CorrelationId` groups related work, and it is
deliberately not a trace ID: observability keeps its own W3C trace and span IDs.

## Content travels in a closed set of shapes

Anything a model or tool passes around is one of a small, fixed set of content
kinds, so a reader never has to guess how to interpret a payload:

```json
{ "kind": "text", "text": "hello" }
{ "kind": "json", "value": { "answer": 42 } }
{ "kind": "binary", "mediaType": "image/png", "encoding": "base64", "data": "…", "byteLength": 1024, "digest": "…" }
{ "kind": "media-ref", "mediaType": "audio/wav", "resource": "…" }
```

Large or external bytes travel as a reference rather than inline. A resource
reference carries an ID, media type, size, and digest, and a resolver turns it
into bytes. It never carries a file path, a signed URL, a bucket, or a
credential, so a stored contract leaks no location or secret.

## Unknown data survives round-trips

A contract can carry namespaced `extensions`, keyed by reverse-DNS names. Entries
your code does not recognise survive decoding, storage, forwarding, and
re-encoding unchanged. That is how a provider's extra data rides along without
leaking into core fields or being dropped.

Provider-native values follow the same rule from the other direction: they stay
behind the [adapter boundary](/adapters/) and appear only under provider metadata
or a namespaced extension, never in a portable core field.

## Secrets are references, never values

A contract never carries a credential. Secrets appear only as opaque references,
and their values stay out of requests, profiles, events, and diagnostics. The
credential is resolved where the effect actually runs, inside an adapter, not
where the portable request is built.

## Schemas are generated and pinned

Contracts are authored as constrained TypeScript and generate checked JSON Schema
from that single source, so the wire shape and the type never drift apart. A
`SchemaRef` pins a schema by its stable id, its version, and a digest of the exact
published bytes, which is what lets two runtimes agree they are speaking the same
contract before they exchange anything.

## Why this matters

These rules are what the guarantees elsewhere rest on. Because contracts are
portable, a run is storable and resumable; because identity is stable, events
correlate; because native data stays behind adapters, a provider swap stays
local. The [Vocabulary](/reference/vocabulary) names each contract; this page is
the shape they all share.
