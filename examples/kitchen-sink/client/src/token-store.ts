import type { ProviderId } from "./demo-options";

const TOKEN_PREFIX = "llm-core-token";

const buildStorageKey = (providerId: ProviderId) => `${TOKEN_PREFIX}:${providerId}`;

const readStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readStorageItem = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageItem = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorageItem = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const readProviderToken = (providerId: ProviderId) => {
  const storage = readStorage();
  if (!storage) {
    return null;
  }
  return readStorageItem(storage, buildStorageKey(providerId));
};

export const writeProviderToken = (providerId: ProviderId, token: string) => {
  const storage = readStorage();
  if (!storage) {
    return false;
  }
  return writeStorageItem(storage, buildStorageKey(providerId), token);
};

export const clearProviderToken = (providerId: ProviderId) => {
  const storage = readStorage();
  if (!storage) {
    return false;
  }
  return removeStorageItem(storage, buildStorageKey(providerId));
};

export const readAllProviderTokens = (providers: ProviderId[]) => {
  const storage = readStorage();
  if (!storage) {
    return [];
  }
  const tokens: Array<{ providerId: ProviderId; token: string }> = [];
  for (const providerId of providers) {
    const token = readStorageItem(storage, buildStorageKey(providerId));
    if (token !== null) {
      tokens.push({ providerId, token });
    }
  }
  return tokens;
};
