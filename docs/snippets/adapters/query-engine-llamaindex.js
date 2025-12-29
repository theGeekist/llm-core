// #region docs
import { fromLlamaIndexQueryEngine } from "#adapters";
import { BaseQueryEngine } from "@llamaindex/core/query-engine";
import { EngineResponse } from "@llamaindex/core/schema";

// 1. Create the complex engine upstream
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

const complexEngine = new DemoQueryEngine();

// 2. Wrap it as a simple "Query In -> Answer Out" adapter
const queryEngine = fromLlamaIndexQueryEngine(complexEngine);

// 3. Use it in your workflow
const result = await queryEngine.query("Compare Q1 revenue for Apple and Google");
console.log(result.text);
// #endregion docs
