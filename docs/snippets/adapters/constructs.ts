// #region docs
import { Adapter } from "#adapters";
import type { AdapterPlugin } from "#adapters";

const client = {}; // Mock client

const plugin = Adapter.register("custom.mcp", "mcp", { client });
plugin satisfies AdapterPlugin;
// #endregion docs
void plugin;
