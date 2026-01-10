// #region docs
import { Adapter, fromLangChainCallbackHandler } from "#adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace("custom.trace", fromLangChainCallbackHandler(handler));
// #endregion docs

void trace;
