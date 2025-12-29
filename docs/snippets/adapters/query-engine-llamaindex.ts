// #region docs
import { fromLlamaIndexQueryEngine } from "#adapters";
import type { QueryEngine, QueryResult } from "#adapters";
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

// 1. Create the complex engine upstream
const complexEngine = new DemoQueryEngine();

// 2. Wrap it as a simple "Query In -> Answer Out" adapter
const queryEngine: QueryEngine = fromLlamaIndexQueryEngine(complexEngine);

// 3. Use it in your workflow
const result: QueryResult = await queryEngine.query("Compare Q1 revenue for Apple and Google");
console.log(result.text);
// #endregion docs
