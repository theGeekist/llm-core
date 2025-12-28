# Tutorial: Human-in-the-Loop (HITL)

Sometimes, you don't want the AI to finish. You want it to **ask for permission**.
Common scenarios:

- **Publication**: "Draft a tweet, but let me edit it before posting."
- **spending**: "Plan a travel itinerary, but ask before booking flights."

This requires a workflow that can **Pause**, **Save State**, and **Resume** later.

## 1. The "Pause" Concept

In `llm-core`, a workflow doesn't just return a result. It returns a **Ticket**.
If the workflow stops (e.g. at a `GateStep`), it gives you a `paused` status and a `token`.

**Think of the token as a "Save Game" file.** You can store it in your database and come back tomorrow.

## 2. How to use it

The HITL Recipe places a "Gate" in your workflow.

```text
graph TD
    A --> B
```

### The Code Flow

```ts
// 1. Run the workflow
const result = await hitlRecipe.run({ input: "Draft a post" });

if (result.status === "paused") {
  // It stopped!
  // "result.token" is your Ticket. Save it.
  console.log("Please approve this draft:", result.artefact);
  await db.saveHeader(result.token);
}

// ... later, when user clicks 'Approve' ...

// 2. Resume with the Ticket
const final = await hitlRecipe.resume(token, { decision: "approve" });
// Now it proceeds to the 'Publish' step.
```

## Source Code

<<< @/../src/recipes/hitl/index.ts
