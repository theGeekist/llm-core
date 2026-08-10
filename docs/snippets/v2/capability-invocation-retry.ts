import {
  executeWithQualifiedRetry,
  registerCapabilityInvocation,
  type AnyRegisteredRuntimeCapabilityBinding,
} from "@geekist/llm-core/agent/runtime";
import type { InvocationContext } from "@geekist/llm-core/contracts";
import type { Snapshot } from "@geekist/llm-core/state";

declare const invocationContext: InvocationContext;
declare const snapshot: Snapshot;
declare const binding: AnyRegisteredRuntimeCapabilityBinding;

const invocation = registerCapabilityInvocation({
  invocationContext,
  state: { kind: "paused-snapshot", snapshot },
});

const result = await executeWithQualifiedRetry({
  binding,
  effect: "read-only",
  phase: "before-start",
  call: () => binding.port,
  policy: {
    maxAttempts: 3,
    delayMs: 0,
    retryOn: ["network"],
    guarantee: "read-only",
  },
  classifyFailure: () => "network",
});

console.log(invocation.state?.kind, result);
