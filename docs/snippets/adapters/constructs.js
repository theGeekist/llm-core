// #region docs
import { Adapter } from "#adapters";

const client = {}; // Mock client

const plugin = Adapter.register("custom.mcp", "mcp", { client });
// #endregion docs
void plugin;
