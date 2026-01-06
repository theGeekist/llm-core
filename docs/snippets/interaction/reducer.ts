// #region docs
import type { InteractionEvent, InteractionState } from "#interaction";
import { reduceInteractionEvents } from "#interaction";

const state: InteractionState = {
  messages: [],
  diagnostics: [],
  trace: [],
  events: [],
};

const meta = { sequence: 1, timestamp: Date.now(), sourceId: "model.primary" };
const events: InteractionEvent[] = [
  { kind: "model", event: { type: "start" }, meta },
  {
    kind: "model",
    event: { type: "delta", text: "Hello" },
    meta: { ...meta, sequence: 2 },
  },
  { kind: "model", event: { type: "end" }, meta: { ...meta, sequence: 3 } },
];

const next = reduceInteractionEvents(state, events);
// #endregion docs

void next;
