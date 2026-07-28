// #region docs
import { createAdapterRegistry } from "#adapters";
import type { Model } from "#adapters";

const myModelAdapter = {} as Model; // Mock

const registry = createAdapterRegistry();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter as Model,
});
// #endregion docs
