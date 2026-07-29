import { maybeChain } from "#shared/maybe";
import type { ExecuteControlledToolInput } from "../tool-execution/public";
import { actionDigestsEqual } from "../../features/evidence/public";
import { bindAction } from "../../features/tooling/public";
import type { RegisteredResumableCheckpoint } from "../../features/state/public";
import type { ControlledAgentToolExecutionPort } from "./types";

export const guardResumeToolExecution = (
  port: ControlledAgentToolExecutionPort,
  checkpoint: RegisteredResumableCheckpoint,
): ControlledAgentToolExecutionPort => {
  const blockedSteps = new Set([
    ...checkpoint.completedStepIds,
    ...checkpoint.recordedEffects.map((effect) => effect.stepId),
  ]);
  return Object.freeze({
    execute(input: ExecuteControlledToolInput) {
      const stepId = input.call.invocation.stepId;
      if (!stepId || blockedSteps.has(stepId)) {
        throw new TypeError(
          "Checkpoint resume cannot execute an unbound or previously recorded effect step.",
        );
      }
      return maybeChain((bound) => {
        if (
          checkpoint.recordedEffects.some((effect) =>
            actionDigestsEqual(effect.actionDigest, bound.digest),
          )
        ) {
          throw new TypeError("Checkpoint resume cannot replay a recorded action digest.");
        }
        return port.execute(input);
      }, bindAction({
        spec: input.binding.spec,
        call: input.call,
        securityDomain: input.securityDomain,
        keyRef: input.digestKeyRef,
        digestPort: input.digestPort,
      }));
    },
  });
};
