// #region docs
import { Adapter, fromLangChainCallbackHandler } from "#adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const sink = fromLangChainCallbackHandler(handler);
const tracePlugin = Adapter.trace({ key: "custom.trace", value: sink });
// #endregion docs

void tracePlugin;
