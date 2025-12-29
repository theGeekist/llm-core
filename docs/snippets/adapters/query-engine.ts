// #region docs
import { fromLlamaIndexQueryEngine } from "#adapters";
import type { QueryEngine } from "#adapters";
import { BaseQueryEngine } from "@llamaindex/core/query-engine";
import { EngineResponse } from "@llamaindex/core/schema";

class DemoQueryEngine extends BaseQueryEngine {
  async _query(query: string) {
    return EngineResponse.fromResponse(`Answer for ${query}`, false, []);
  }

  protected _getPrompts() {
    return {};
  }

  protected _updatePrompts() {}

  protected _getPromptModules() {
    return {};
  }
}

const engine = new DemoQueryEngine();

const queryEngine: QueryEngine = fromLlamaIndexQueryEngine(engine);
// #endregion docs

void queryEngine;
