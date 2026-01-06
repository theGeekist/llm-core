// #region docs
import type { Model, ModelCall } from "#adapters";
import { collectStep, isPromiseLike, maybeToStep } from "#adapters";

const model = {} as Model; // Mock
const call = {} as ModelCall; // Mock

if (model.stream) {
  const stepResult = maybeToStep(model.stream(call));
  const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
  const collected = collectStep(step);
  const events = isPromiseLike(collected) ? await collected : collected;
  for (const event of events) {
    // Narrowing the union type
    if (event.type === "delta") {
      process.stdout.write(event.text ?? "");
    }
  }
}
// #endregion docs
