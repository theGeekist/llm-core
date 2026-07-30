import type { AgentRunEvent, RunResult } from "../../features/agent/public";

export const resultFacts = (result: RunResult): AgentRunEvent["facts"] => ({
  status: result.status,
  ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
});
