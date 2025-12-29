// #region docs
import { createRegistryFromDefaults } from "#adapters";
import type { Model } from "#adapters";

const myModelAdapter = {} as Model; // Mock

const registry = createRegistryFromDefaults();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter as Model,
});
// #endregion docs
