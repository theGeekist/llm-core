import type { AgentEvent, AgentResult } from "../../features/agent/public";

export const resultFacts = (result: AgentResult): AgentEvent["facts"] => ({
  status: result.status,
  ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
});
