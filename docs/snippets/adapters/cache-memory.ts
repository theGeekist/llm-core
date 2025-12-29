// #region docs
import { createMemoryCache } from "#adapters";
import type { Cache } from "#adapters";

// 1. Create a cache (TTL is provided at call time)
const cache: Cache = createMemoryCache();

// 2. Use it in a workflow (example conceptual usage)
// The workflow engine checks this cache before calling the model
// #endregion docs
void cache;
