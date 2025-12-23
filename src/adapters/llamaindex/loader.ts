import type { BaseReader } from "@llamaindex/core/schema";
import type { DocumentLoader } from "../types";
import { mapMaybeArray } from "../../maybe";

export function fromLlamaIndexLoader(reader: BaseReader): DocumentLoader {
  function load() {
    return mapMaybeArray(reader.loadData(), (doc) => ({
      id: doc.id_,
      text: doc.text ?? "",
      metadata: doc.metadata,
    }));
  }

  return { load };
}
