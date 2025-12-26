# Unified Media Inputs

One of the hardest parts of working with LLMs is juggling input formats. Some APIs want base64 strings, others want Data URLs, and others want raw buffers.

`llm-core` handles this for you. You pass what you have; the framework makes it work.

## The Principle: "Just Pass It"

The library uses a **Universal Content Normalizer** that runs before any adapter sees your data. This means you can be agnostic about how your data is stored.

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

You don't need to manually construct complex API objects. Use the `toMessageContent` helper to unify text and images.

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

## Next Steps

Unified Media is just one part of the "Universal Normalisation" story.

- [Deep Dive: Hidden Gems](/guide/deep-dive#5-putting-it-together-the-doc-review-story) -> See how Unified Media combines with Pause/Resume in a real "Doc Review" story.
