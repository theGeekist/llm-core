import type { BaseReader } from "@llamaindex/core/schema";
import type { AdapterRequest, DocumentLoader } from "../types";
import { maybeMapArray } from "#shared/maybe";

export function fromLlamaIndexLoader(reader: BaseReader): DocumentLoader {
  function load(_request: AdapterRequest) {
    return maybeMapArray(
      (doc) => ({
        id: doc.id_,
        text: doc.text ?? "",
        metadata: doc.metadata,
      }),
      reader.loadData(),
    );
  }

  return { load };
}
