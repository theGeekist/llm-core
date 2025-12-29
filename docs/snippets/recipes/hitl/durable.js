// #region docs
import { recipes } from "#recipes";
import { createMemoryCache } from "#adapters";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { fromLangGraphCheckpointer } from "#adapters";
// #endregion docs

// #region docs
const gate = recipes.hitl().defaults({
  adapters: {
    cache: createMemoryCache(),
  },
});

const checkpointer = new MemorySaver();

const gateWithCheckpoint = recipes.hitl().defaults({
  adapters: {
    checkpoint: fromLangGraphCheckpointer(checkpointer),
  },
});
// #endregion docs

void gate;
void gateWithCheckpoint;
