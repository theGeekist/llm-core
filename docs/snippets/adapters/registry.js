// #region docs
import { createAdapterRegistry } from "#adapters";

const myModelAdapter = {}; // Mock

const registry = createAdapterRegistry();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter,
});
// #endregion docs
