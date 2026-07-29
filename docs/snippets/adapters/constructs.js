// #region docs
import { Adapter } from "#adapters";

const client = {}; // Mock client

const plugin = Adapter.plugin({
  key: "custom.mcp",
  adapters: { constructs: { mcp: { client } } },
});
// #endregion docs
void plugin;
