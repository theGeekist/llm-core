# Storage and memory

Storage ports describe host-owned persistence without choosing a database. Conversation memory is a separate portable contract layered over those storage concerns.

<<< @/snippets/v2/storage-memory.ts

`CacheStore` is TTL-oriented, `KeyValueStore` is batched named storage, and `ResourceStore` owns live bytes behind portable `ResourceRef` values. The agent-memory `ConversationStore` owns ordered `ConversationMessage` values; its serialized append field remains `turn` for wire compatibility. `ConversationStateStore` owns application state derived for a conversation. These extension ports are distinct from the reservation-capable `ConversationStore` used by an explicit `InteractionSession`. None of them expose credentials, database handles or provider-native messages.

Validate values before persistence. Sensitive-looking portable keys and strings are rejected by the registration helpers, and native data must be redacted and namespaced before it reaches portable state or evidence.

These ports do not promise a particular consistency model beyond their exact method contracts. A storage adapter owns database selection, credentials, transactions, and operational guarantees. Capability evidence records which additional guarantees a configured binding has demonstrated.
