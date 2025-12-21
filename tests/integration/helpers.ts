import { it } from "bun:test";

export const itIfEnv =
  (env: string) => (name: string, fn: () => Promise<void> | void, timeout?: number) =>
    (process.env[env] ? it : it.skip)(name, fn, timeout);

export const itIfEnvAll =
  (...envs: string[]) =>
  (name: string, fn: () => Promise<void> | void, timeout?: number) => {
    const enabled = envs.every((env) => process.env[env]);
    return (enabled ? it : it.skip)(name, fn, timeout);
  };

export const normalizeOllamaUrl = (url: string) => {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};
