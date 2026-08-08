export const upstream = Object.freeze({
  name: "OpenHands Software Agent SDK",
  version: "1.37.1",
  source: "https://github.com/OpenHands/software-agent-sdk",
  revision: "310989d306114efd0fcadbcbed9ff9c21d4a5963",
});

export const operations = Object.freeze([
  {
    operationId: "native.message-event-round-trip",
    disposition: "supported",
    upstream: upstream.name,
    upstreamVersion: upstream.version,
  },
  {
    operationId: "native.distributed-workflow-durability",
    disposition: "unsupported",
    upstream: upstream.name,
    upstreamVersion: upstream.version,
  },
] as const);

export const integrationName = "aifsd-fixture-openhands";
