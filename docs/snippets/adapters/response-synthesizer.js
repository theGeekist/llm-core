// #region docs
import { fromLlamaIndexResponseSynthesizer } from "#adapters";
import { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { EngineResponse } from "@llamaindex/core/schema";

class DemoSynthesizer extends BaseSynthesizer {
  constructor() {
    super({});
  }

  /**
   * @param {unknown} query
   * @param {unknown[]} _nodes
   * @param {boolean} _stream
   */
  async getResponse(query, _nodes, _stream) {
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

const synthesizerInstance = new DemoSynthesizer();

const synthesizer = fromLlamaIndexResponseSynthesizer(synthesizerInstance);
// #endregion docs

void synthesizer;
