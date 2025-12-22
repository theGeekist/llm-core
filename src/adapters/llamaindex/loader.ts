import type { BaseReader } from "@llamaindex/core/schema";
import type { AdapterDocumentLoader } from "../types";
import { mapMaybeArray } from "../../maybe";

export function fromLlamaIndexLoader(reader: BaseReader): AdapterDocumentLoader {
  function load() {
    return mapMaybeArray(reader.loadData(), (doc) => ({
      id: doc.id_,
      text: doc.text ?? "",
      metadata: doc.metadata,
    }));
  }

  return { load };
}
