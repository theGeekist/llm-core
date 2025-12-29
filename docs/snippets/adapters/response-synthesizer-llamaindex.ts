// #region docs
import { fromLlamaIndexResponseSynthesizer } from "#adapters";
import type { ResponseSynthesizer } from "#adapters";
import { BaseSynthesizer } from "@llamaindex/core/response-synthesizers";
import { EngineResponse } from "@llamaindex/core/schema";

class DemoSynthesizer extends BaseSynthesizer {
  constructor() {
    super({});
  }

  async getResponse(query: string, _nodes: unknown[], _stream: boolean) {
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

const synthesizerEngine: BaseSynthesizer = new DemoSynthesizer();

const synthesizer: ResponseSynthesizer = fromLlamaIndexResponseSynthesizer(synthesizerEngine);
// #endregion docs

void synthesizer;
