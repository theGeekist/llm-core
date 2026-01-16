import type { ProviderId } from "./demo-options";

const TOKEN_PREFIX = "llm-core-token";

const buildStorageKey = (providerId: ProviderId) => `${TOKEN_PREFIX}:${providerId}`;

const readStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage;
};

export const readProviderToken = (providerId: ProviderId) => {
  const storage = readStorage();
  if (!storage) {
    return null;
  }
  return storage.getItem(buildStorageKey(providerId));
};

export const writeProviderToken = (providerId: ProviderId, token: string) => {
  const storage = readStorage();
  if (!storage) {
    return false;
  }
  storage.setItem(buildStorageKey(providerId), token);
  return true;
};

export const clearProviderToken = (providerId: ProviderId) => {
  const storage = readStorage();
  if (!storage) {
    return false;
  }
  storage.removeItem(buildStorageKey(providerId));
  return true;
};

export const readAllProviderTokens = (providers: ProviderId[]) => {
  const tokens: Array<{ providerId: ProviderId; token: string }> = [];
  for (const providerId of providers) {
    const token = readProviderToken(providerId);
    if (token) {
      tokens.push({ providerId, token });
    }
  }
  return tokens;
};
