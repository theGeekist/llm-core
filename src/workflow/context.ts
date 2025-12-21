// References: docs/stage-8.md (adapter-aware context helpers)

import type { AdapterBundle } from "../adapters/types";
import type { PipelineContext } from "./types";

export const getAdapters = (context: PipelineContext): AdapterBundle | undefined =>
  context.adapters;
