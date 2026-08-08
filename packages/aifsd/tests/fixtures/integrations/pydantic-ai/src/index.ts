export const upstream = Object.freeze({
  name: "PydanticAI",
  version: "2.19.0",
  source: "https://github.com/pydantic/pydantic-ai",
  revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
});

export const operations = Object.freeze([
  {
    operationId: "native.typed-agent-run",
    disposition: "supported",
    upstream: upstream.name,
    upstreamVersion: upstream.version,
  },
  {
    operationId: "native.intrinsic-crash-durable-run",
    disposition: "unsupported",
    upstream: upstream.name,
    upstreamVersion: upstream.version,
  },
] as const);

export const integrationName = "aifsd-fixture-pydantic-ai";
