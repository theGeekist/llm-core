// #region docs
import { Adapter, fromLangChainCallbackHandler } from "#adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace({
  key: "custom.trace",
  value: fromLangChainCallbackHandler(handler),
});
// #endregion docs

void trace;
