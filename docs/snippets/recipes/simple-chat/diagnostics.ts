// #region docs
import { recipes } from "#recipes";

const chat = recipes["chat.simple"]({
  model: "gpt-4o-mini",
});

// chat handle from above
const outcome = await chat.run({ input: "Explain DSP." }, { runtime: { diagnostics: "strict" } });

console.log(outcome.diagnostics);
console.log(outcome.trace);
// #endregion docs
