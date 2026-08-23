import { snapshot } from "@aifsd/strict-json";
import { isDigest } from "@geekist/llm-core/contracts";
import { isPromiseLike, maybeThen, maybeTry } from "@wpkernel/pipeline";
import type {
  AcceptedProjectEvent,
  Digest,
  MaybePromise,
  ProjectContentDigester,
  ProjectProjection,
  ProjectResult,
  ProjectedAssertion,
} from "./contract.js";
import { PROJECT_PROJECTION_PROTOCOL_VERSION } from "./contract.js";
import { materialiseAssertions } from "./assertions.js";
import { deriveTaskStates } from "./derived-state.js";

const projectionFailure = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "projection-drift", reasonCode: "projection-divergent" }],
});

const digestValue = (
  value: unknown,
  digester: ProjectContentDigester,
): MaybePromise<ProjectResult<Digest>> =>
  maybeTry(
    () =>
      maybeThen(digester.digest(value), (digest) => {
        const strictDigest = snapshot(digest);
        return isDigest(strictDigest) ? { ok: true, value: strictDigest } : projectionFailure();
      }),
    projectionFailure,
  );

const projectAssertions = (
  assertions: readonly ProjectedAssertion["assertion"][],
  digester: ProjectContentDigester,
): MaybePromise<ProjectResult<readonly ProjectedAssertion[]>> => {
  const projected: ProjectedAssertion[] = [];
  const visit = (start: number): MaybePromise<ProjectResult<readonly ProjectedAssertion[]>> => {
    for (let index = start; index < assertions.length; index += 1) {
      const assertion = assertions[index]!;
      const canonicalDigest = digestValue(assertion, digester);
      if (isPromiseLike(canonicalDigest)) {
        return maybeThen(canonicalDigest, (resolved) => {
          if (!resolved.ok) return resolved;
          projected.push({ assertion, canonicalDigest: resolved.value });
          return visit(index + 1);
        });
      }
      if (!canonicalDigest.ok) return canonicalDigest;
      projected.push({ assertion, canonicalDigest: canonicalDigest.value });
    }
    return { ok: true, value: projected };
  };
  return visit(0);
};

export const buildProjectProjection = (
  events: readonly AcceptedProjectEvent[],
  digester: ProjectContentDigester,
): MaybePromise<ProjectResult<ProjectProjection>> => {
  const projectId = events[0]?.projectId;
  if (projectId === undefined || events.some((event) => event.projectId !== projectId)) {
    return projectionFailure();
  }
  const materialised = materialiseAssertions(events);
  if (!materialised.ok) return materialised;
  return maybeThen(projectAssertions(materialised.value, digester), (assertions) => {
    if (!assertions.ok) return assertions;
    const tasks = deriveTaskStates(materialised.value, events.at(-1)!.admittedAt);
    return maybeThen(
      digestValue(
        events.map(({ eventDigest }) => eventDigest),
        digester,
      ),
      (journalDigest) => {
        if (!journalDigest.ok) return journalDigest;
        const checkpoint = {
          projectId,
          position: events.length,
          lastEventId: events.at(-1)?.eventId ?? null,
          journalDigest: journalDigest.value,
        };
        const projectionBase = {
          projectId,
          protocolVersion: PROJECT_PROJECTION_PROTOCOL_VERSION,
          checkpoint,
          assertions: assertions.value,
          tasks,
        } as const;
        return maybeThen(digestValue(projectionBase, digester), (projectionDigest) =>
          projectionDigest.ok
            ? {
                ok: true,
                value: { ...projectionBase, projectionDigest: projectionDigest.value },
              }
            : projectionDigest,
        );
      },
    );
  });
};
