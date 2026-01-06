// #region docs
import { collectStep, isPromiseLike, maybeToStep } from "#adapters";

const model = {}; // Mock
const call = {}; // Mock

// Mock stream iterator
/** @param {unknown} _call */
model.stream = async function* (_call) {
  yield { type: "delta", text: "Hello" };
};

// Check if stream exists (optional in some implementations)
if (model.stream) {
  const stepResult = maybeToStep(model.stream(call));
  const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
  const collected = collectStep(step);
  const events = isPromiseLike(collected) ? await collected : collected;
  for (const event of events) {
    if (event.type === "delta") process.stdout.write(event.text ?? "");
  }
}
// #endregion docs
