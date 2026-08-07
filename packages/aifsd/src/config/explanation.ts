// Renderer-neutral explanation surface. Resolution decisions are captured when
// releases are chosen and carried into the lock; planned-change decisions are
// captured by the planner. This module exposes those facts without inventing
// prose or reconstructing rationale from incidental output fields.

import type {
  ChangeDecision,
  ChangePlan,
  ConfigurationDecision,
  ConfigurationLock,
  PlannedChange,
  ResolvedConfiguration,
} from "./contract.js";
import { freezeConfigurationData } from "./diagnostics.js";

type ExplainableConfiguration = ResolvedConfiguration | ConfigurationLock | ChangePlan;

const changeDecision = (change: PlannedChange): ChangeDecision => ({
  kind: "planned-change",
  path: change.path,
  change: change.change,
  ownership: change.ownership,
  reasonCode: change.reasonCode,
  ...(change.renameTo === undefined ? {} : { renameTo: change.renameTo }),
  ...(change.contentDigest === undefined ? {} : { contentDigest: change.contentDigest }),
  expectedCurrentDigest: change.expectedCurrentDigest,
});

/** Return immutable semantic facts captured by resolution or planning. */
export const explainConfiguration = (
  subject: ExplainableConfiguration,
): readonly ConfigurationDecision[] => {
  const decisions =
    "changes" in subject
      ? subject.changes.map(changeDecision)
      : subject.resolutionDecisions.map((decision) => ({ ...decision }));
  return freezeConfigurationData(structuredClone(decisions));
};
