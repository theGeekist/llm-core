// #region docs
const model = {}; // Mock
const call = {}; // Mock

// Mock stream iterator
/** @param {unknown} _call */
model.stream = async function* (_call) {
  yield { type: "delta", text: "Hello" };
};

// Check if stream exists (optional in some implementations)
if (model.stream) {
  for await (const event of model.stream(call)) {
    if (event.type === "delta") process.stdout.write(event.text ?? "");
  }
}
// #endregion docs
