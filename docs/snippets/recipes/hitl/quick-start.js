// #region docs
import { recipes } from "#recipes";
// #endregion docs

// #region docs
const gate = recipes.hitl();
const runtime = gate.build();

const first = await runtime.run({ input: "Draft a policy update." });

if (first.status === "paused") {
  const token = first.token;

  const resumed = await runtime.resume?.(token, {
    decision: "approve",
  });

  console.log(resumed?.status);
}
// #endregion docs
