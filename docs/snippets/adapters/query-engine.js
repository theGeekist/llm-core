// #region docs
import { fromLlamaIndexQueryEngine } from "#adapters";
import { BaseQueryEngine } from "@llamaindex/core/query-engine";
import { EngineResponse } from "@llamaindex/core/schema";

class DemoQueryEngine extends BaseQueryEngine {
  /**
   * @param {unknown} query
   * @param {boolean | undefined} _stream
   */
  async _query(query, _stream) {
    return EngineResponse.fromResponse(`Answer for ${String(query)}`, false, []);
  }

  _getPrompts() {
    return {};
  }

  _updatePrompts() {}

  _getPromptModules() {
    return {};
  }
}

const engine = new DemoQueryEngine();

const queryEngine = fromLlamaIndexQueryEngine(engine);
// #endregion docs

void queryEngine;
