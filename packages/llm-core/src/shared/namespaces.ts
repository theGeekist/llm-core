export const ensureNamespacedId = (namespace: string, id: string) =>
  id.includes(".") ? id : `${namespace}.${id}`;
