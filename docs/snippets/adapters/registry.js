// #region docs
import { createRegistryFromDefaults } from "#adapters";

const myModelAdapter = {}; // Mock

const registry = createRegistryFromDefaults();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter,
});
// #endregion docs
