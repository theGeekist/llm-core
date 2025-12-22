import { expect, it } from "bun:test";

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

export const expectTelemetryPresence = (result: { telemetry?: unknown }) => {
  expect(result.telemetry).toBeDefined();
};

export const expectTelemetryUsage = (
  usage:
    | {
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
      }
    | undefined,
) => {
  expect(usage).toBeDefined();
  const total = usage?.totalTokens ?? usage?.inputTokens ?? usage?.outputTokens;
  expect(typeof total).toBe("number");
  if (typeof total === "number") {
    expect(total).toBeGreaterThan(0);
  }
};
