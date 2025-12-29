// #region docs
import type { Model, ModelCall } from "#adapters";

const model = {} as Model; // Mock
const call = {} as ModelCall; // Mock

if (model.stream) {
  const stream = await model.stream(call);
  for await (const event of stream) {
    // Narrowing the union type
    if (event.type === "delta") {
      process.stdout.write(event.text ?? "");
    }
  }
}
// #endregion docs
