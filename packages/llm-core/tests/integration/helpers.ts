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

const stripTrailingSlashes = (value: string) => {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
};

export const normalizeOllamaUrl = (url: string) => {
  const trimmed = stripTrailingSlashes(url.trim());
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

export const expectTelemetryPresence = (result: { telemetry?: unknown }) => {
  expect(result.telemetry).toBeDefined();
};

export const expectTelemetryUsage = (
  usage:
    | {
        totalTokens?: number | null;
        inputTokens?: number | null;
        outputTokens?: number | null;
      }
    | null
    | undefined,
) => {
  expect(usage).toBeDefined();
  const total = usage?.totalTokens ?? usage?.inputTokens ?? usage?.outputTokens;
  expect(typeof total).toBe("number");
  if (typeof total === "number") {
    expect(total).toBeGreaterThan(0);
  }
};
