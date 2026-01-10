# Unified Inputs

One of the most tedious parts of AI engineering is format fatigue. Some APIs want base64 strings. Others want URLs. Some want raw Buffers. Some need distinct MIME types.

`llm-core` solves this with a **Universal Content Normaliser**.

**The Promise**: You have a file. The model needs tokens. The framework bridges the gap so you stop writing format converters.

---

## 1) "Just Pass It"

Whether you have a remote URL, a local file path, or a raw Buffer, you pass it to the workflow in the same way. The adapters handle the translation for the specific provider.

```ts
// 1. Remote URL
await workflow.run({ image: "https://example.com/chart.png" });

// 2. Data URI (Clipboard paste)
await workflow.run({ image: "data:image/png;base64,iVBORw0KGgo..." });

// 3. Raw Buffer (Node.js)
const myBuffer = fs.readFileSync("chart.png");
await workflow.run({ image: myBuffer });
```

You do not need to check `if (input instanceof Buffer)`. You do not need to check the provider's API docs to see if they support URLs. You just pass the image.

---

## 2) Multi-modal Content

When you need to mix text and images (e.g. "Look at this design and critique it"), use the `toMessageContent` helper. It creates a standard structure that works across OpenAI, Anthropic, and others.

```ts
import { toMessageContent } from "@geekist/llm-core/adapters";

const input = toMessageContent([
  "Here is the design:",
  { type: "image", url: "https://..." },
  "What do you think?",
]);

// Works with any multi-modal capable adapter
await workflow.run(input);
```

---

## 3) How it works (Lazy Conversion)

We treat binary data carefully.

1.  **Reference, don't copy**: Large buffers are passed by reference until the last possible moment.
2.  **Lazy Base64**: We only convert to Base64 _if_ the specific adapter requires it. If the provider supports raw binary or URLs, we use those instead.
3.  **Auto-detection**: We sniff the MIME type from the buffer signature if you don't provide one.

This gives you a cleaner codebase (no format logic) and better performance (no unnecessary copying or encoding).
