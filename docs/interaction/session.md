---
title: Sessions
---

# Interaction Sessions (Headless)

Sessions give you a place to keep interaction state and apply save policies without tying yourself to any specific host runtime. You provide a `SessionStore` (Redis, KV, database, memory, and so on) and core coordinates a simple flow: **load → run → apply policy → save**.

---

## 1) When to use sessions

Use sessions whenever an interaction lasts longer than a single request.

**Long-lived chat**

A user returns to a page and should see the same assistant, with the same history, not a fresh conversation. Sessions keep the interaction state across requests so the model can respond with proper context.

**Audit trails**

Sometimes the important part of a run is not only the answer, but how you arrived at it. By persisting `state.trace` you can review tool calls, retries, and intermediate steps when you debug or need to explain behaviour later.

**Resumable workflows**

Multi-step flows often pause and resume over hours or days. A user might fill in part of a form, switch devices, or come back after an approval step. Sessions keep the workflow state so you can resume from where the user left off.

For short, one-off interactions such as an inline search bar or a single "answer this" call, you can work directly with the raw [Pipeline](/interaction/pipeline) and skip sessions.

---

## 2) Quick start

At a minimum you need two things:

- A `SessionStore` adapter that knows how to load and save state (Redis, KV, SQL, memory, and so on).
- A workflow or recipe you want to run for that session.

Once you have a store, you create a session instance and call `send()` when new input arrives.

::: code-group
<<< @/snippets/interaction/session.js#docs [JavaScript]
<<< @/snippets/interaction/session.ts#docs [TypeScript]
:::

`send()` returns the outcome of the interaction run for that session. The shape is the same as other runtime outcomes: `{ status, artefact, diagnostics, trace }`.

After each run, `session.getState()` reflects the latest **persisted** state for that session. You can use this to:

- Render chat history or workflow progress in your UI
- Inspect state during tests or debugging

---

## 3) Policy hooks

Policy hooks let you shape what gets saved for a session. You can merge old and new state, summarise history, or trim it before it hits the store.

### Example: length-based truncation

This policy keeps only the last 50 messages so the session does not grow without bound.

::: code-group
<<< @/snippets/interaction/session-policy.js#docs [JavaScript]
<<< @/snippets/interaction/session-policy.ts#docs [TypeScript]
:::

Hooks are optional. When present, they run in this order: `merge` → `summarize` → `truncate`. Core leaves policy decisions in your hands so you can match your own storage and cost constraints.

---

## 4) Paused outcomes

Some workflows pause instead of finishing in one run. A common example is Human-in-the-Loop, where the system waits for a person to approve or provide extra information.

When a workflow returns a paused outcome:

1. The session skips the `policy` and `save` hooks. Storage waits until the workflow completes.
2. The in-memory `state` still updates from the paused snapshot so your UI can render the paused state immediately.
3. When you resume, the session loads the last saved state, applies the resume snapshot on top of it, and continues the workflow from there.

This pattern keeps persistence predictable: only fully completed runs update the store, while paused runs still give you a consistent view of the in-memory state.

---

## 5) Notes

Sessions describe _how_ to persist and manage state rather than _where_ you run your code.

- A `SessionId` is opaque. Core never derives it from user IDs or request data.
- Concurrency rules for the same session come from the store implementation. For example, a Redis-backed store might use locks or transactions, while an in-memory store might keep things single-threaded.
- The optional `context` in session options is forwarded to the `SessionStore`. You can use it for logging, tracing, or tenant-specific behaviour.

If you are already familiar with Interaction Pipeline, think of sessions as the layer that gives your workflows memory and lifecycle rules over time.
