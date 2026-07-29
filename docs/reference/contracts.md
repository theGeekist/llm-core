# Contracts and portability

Portable contracts are JSON-compatible, versioned, and explicit about identity.
They exclude functions, class instances, physical paths, credentials, and
unconstrained native objects.

Core-owned IDs are branded UUID strings. External IDs are opaque printable
strings issued outside core. `InvocationContext` carries authority, limits,
trace correlation, and opaque secret references without carrying secret values.

Content uses a closed set of typed parts. Larger or externally stored values use
integrity-bearing references rather than filesystem paths or URLs.

Extensions are namespaced JSON. Registration rejects sensitive keys and values.
Provider-native data appears only after trusted redaction and remains under its
own reverse-DNS namespace.
