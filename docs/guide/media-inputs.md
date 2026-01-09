# Unified Media Inputs

One of the hardest parts of working with LLMs is juggling input formats. Some APIs want base64 strings, others want Data URLs, and others want raw buffers.

`llm-core` handles this for you. You pass what you have; the framework makes it work.  
This guide walks through how the media pipeline lets you stay agnostic to file formats while still taking advantage of provider-specific capabilities.

> **Real-World Story: The Avatar Upload Problem**
> You're building a profile analysis agent. The user can:
>
> 1. Link to their GitHub avatar (URL).
> 2. Upload a file from their desktop (File/Buffer).
> 3. Paste a screenshot from their clipboard (Data URI).
>
> **Without llm-core**: You write 3 `if` statements, standardizing to Base64 manually, handling clean-up yourself.
> **With llm-core**: You just pass `input.avatar` to the workflow. The **Content Normaliser** automatically detects the format, fetches URLs if the adapter needs raw bytes, or keeps them as URLs if the provider supports it. No conditional logic required.

## The Principle: "Just Pass It"

The library uses a **Universal Content Normaliser** that runs before any adapter sees your data. This means you can be agnostic about how your data is stored.

### Images

Whether you have a remote URL, a local file path, or a raw Buffer, the syntax is the same.

```ts
// 1. Remote URL
await workflow.run({
  image: "https://example.com/chart.png",
});

// 2. Data URI
await workflow.run({
  image: "data:image/png;base64,iVBORw0KGgo...",
});

// 3. Raw Buffer (Node.js) / Uint8Array
const myBuffer = fs.readFileSync("chart.png");
await workflow.run({
  image: myBuffer, // Checksum & Base64 handling is automatic
});
```

### Mixed Content (Multi-modal)

Use the `toMessageContent` helper to unify text and images without manually constructing complex API objects.

```ts
import { toMessageContent } from "@geekist/llm-core/adapters";

const input = toMessageContent([
  "Here is the design:",
  { type: "image", url: "https://..." },
  "What do you think?",
]);

// Result is standardized for ALL providers (OpenAI, Anthropic, etc.)
await workflow.run(input);
```

## Advanced: Buffers & Binary Data

When you pass a `Buffer` or `Uint8Array`, the framework:

1.  **Auto-Detects Mime Type** (where possible) or accepts an explicit one.
2.  **Converts to Base64** lazily, only when the specific provider adapter needs it.
3.  **Prevents Copying**: Large buffers are handled by reference until the last possible moment.

```ts
// Explicit MIME type if needed
await workflow.run({
  type: "image",
  data: myBuffer,
  mimeType: "image/png",
});
```

## Key Takeaways

- [ ] **Just Pass It**: Strings, Buffers, URLs—the framework normalizes them.
- [ ] **One Format**: Internally, everything becomes a standard `MessageContent`.
- [ ] **Lazy**: Conversions (like Base64) only happen if the specific adapter needs them.
