# Storage and memory

Storage ports describe host-owned persistence without choosing a database.
Conversation memory is a separate portable contract layered over those
storage concerns.

<<< @/snippets/v2/storage-memory.ts

`CacheStore` is TTL-oriented, `KeyValueStore` is batched named storage, and
`ResourceStore` owns live bytes behind portable `ResourceRef` values.
`ConversationStore` owns ordered turns; `ConversationStateStore` owns
application state derived for a conversation. None of these ports expose
credentials, database handles or provider-native messages.

Validate values before persistence. Sensitive-looking portable keys and
strings are rejected by the registration helpers, and native data must be
redacted and namespaced before it reaches portable state or evidence.

These ports do not promise a particular consistency model beyond their exact
method contracts. A storage adapter owns database selection, credentials,
transactions, and operational guarantees. Capability evidence records which
additional guarantees a configured binding has demonstrated.
