import type {
  AcceptedProjectEvent,
  ProjectContentDigester,
  ProjectProjection,
  ProjectResult,
  ProjectedAssertion,
} from "./contract.js";
import { PROJECT_PROJECTION_PROTOCOL_VERSION } from "./contract.js";
import { materialiseAssertions } from "./assertions.js";
import { deriveTaskStates } from "./derived-state.js";

export const buildProjectProjection = async (
  events: readonly AcceptedProjectEvent[],
  digester: ProjectContentDigester,
): Promise<ProjectResult<ProjectProjection>> => {
  const projectId = events[0]?.projectId;
  if (projectId === undefined || events.some((event) => event.projectId !== projectId)) {
    return {
      ok: false,
      diagnostics: [{ code: "projection-drift", reasonCode: "projection-divergent" }],
    };
  }
  const materialised = materialiseAssertions(events);
  if (!materialised.ok) return materialised;
  const assertions: ProjectedAssertion[] = [];
  for (const assertion of materialised.value) {
    assertions.push({ assertion, canonicalDigest: await digester.digest(assertion) });
  }
  const tasks = deriveTaskStates(materialised.value, events.at(-1)!.admittedAt);
  const checkpoint = {
    projectId,
    position: events.length,
    lastEventId: events.at(-1)?.eventId ?? null,
    journalDigest: await digester.digest(events.map(({ eventDigest }) => eventDigest)),
  };
  const projectionBase = {
    projectId,
    protocolVersion: PROJECT_PROJECTION_PROTOCOL_VERSION,
    checkpoint,
    assertions,
    tasks,
  } as const;
  return {
    ok: true,
    value: {
      ...projectionBase,
      projectionDigest: await digester.digest(projectionBase),
    },
  };
};
