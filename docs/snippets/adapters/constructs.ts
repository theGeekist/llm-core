// #region docs
import { Adapter } from "#adapters";
import type { AdapterPlugin } from "#adapters";

const client = {}; // Mock client

const plugin = Adapter.plugin({
  key: "custom.mcp",
  adapters: { constructs: { mcp: { client } } },
});
plugin satisfies AdapterPlugin;
// #endregion docs
void plugin;
