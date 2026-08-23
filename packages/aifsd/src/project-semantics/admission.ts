import { snapshot } from "@aifsd/strict-json";
import { isDigest } from "@geekist/llm-core/contracts";
import { maybeThen, maybeTry } from "@wpkernel/pipeline";
import type {
  AcceptedProjectEvent,
  AdmissionDecision,
  AdmissionDecisionContext,
  AdmissionAuthority,
  AdmissionRequest,
  Digest,
  MaybePromise,
  ProjectContentDigester,
  ProjectAdmissionReceipt,
  ProjectResult,
} from "./contract.js";
import { acceptedEventIdentityInput } from "./identity.js";
import { validateAdmissionDecision, validateAdmissionRequest } from "./validation.js";

const admissionReceipts = new WeakSet<AcceptedProjectEvent>();

export const isProjectAdmissionReceipt = (
  event: AcceptedProjectEvent,
): event is ProjectAdmissionReceipt => admissionReceipts.has(event);

const denied = <T = never>(): ProjectResult<T> => ({
  ok: false,
  diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
});

const integrityFailure = (
  reasonCode: "payload-digest-mismatch" | "event-digest-mismatch",
): ProjectResult<never> => ({
  ok: false,
  diagnostics: [{ code: "event-integrity-failed", reasonCode }],
});

const decide = (
  request: AdmissionRequest,
  authority: AdmissionAuthority,
  context: AdmissionDecisionContext,
): MaybePromise<ProjectResult<AdmissionDecision | null>> =>
  maybeTry(
    () =>
      maybeThen(
        authority.decide(request, context),
        (decision): ProjectResult<AdmissionDecision | null> => ({
          ok: true,
          value: decision,
        }),
      ),
    denied,
  );

const digestValue = (
  value: unknown,
  digester: ProjectContentDigester,
  reasonCode: "payload-digest-mismatch" | "event-digest-mismatch",
): MaybePromise<ProjectResult<Digest>> =>
  maybeTry(
    () =>
      maybeThen(digester.digest(value), (digest) => {
        const strictDigest = snapshot(digest);
        return isDigest(strictDigest)
          ? { ok: true, value: strictDigest }
          : integrityFailure(reasonCode);
      }),
    () => integrityFailure(reasonCode),
  );

interface AdmissionContext {
  readonly authority: AdmissionAuthority;
  readonly digester: ProjectContentDigester;
  readonly request: AdmissionRequest;
}

const admitDecidedEvent = (
  proposedDecision: AdmissionDecision | null,
  input: AdmissionContext,
): MaybePromise<ProjectResult<ProjectAdmissionReceipt>> => {
  if (proposedDecision === null) return denied();
  const decision = validateAdmissionDecision(proposedDecision, input.request.observation);
  if (!decision.ok) return decision;
  if (decision.value.authority.authorityId !== input.authority.authorityId) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "authority-mismatch" }],
    };
  }
  const observation = input.request.observation;
  const payload = snapshot(observation.payload);
  return maybeThen(digestValue(payload, input.digester, "payload-digest-mismatch"), (digested) => {
    if (!digested.ok) return digested;
    const base: Omit<AcceptedProjectEvent, "eventDigest"> = {
      eventId: input.request.eventId,
      observationId: observation.observationId,
      projectId: observation.projectId,
      kind: observation.kind,
      sourceAuthority: snapshot(
        observation.sourceAuthority,
      ) as unknown as AcceptedProjectEvent["sourceAuthority"],
      admission: snapshot(decision.value) as unknown as AcceptedProjectEvent["admission"],
      provenance: snapshot(observation.provenance) as unknown as AcceptedProjectEvent["provenance"],
      evidence: snapshot(observation.evidence) as unknown as AcceptedProjectEvent["evidence"],
      ...(observation.causationId === undefined ? {} : { causationId: observation.causationId }),
      correlationId: observation.correlationId,
      observedAt: observation.observedAt,
      admittedAt: decision.value.decidedAt,
      payload: payload as unknown as AcceptedProjectEvent["payload"],
      payloadDigest: digested.value,
    };
    return maybeThen(
      digestValue(acceptedEventIdentityInput(base), input.digester, "event-digest-mismatch"),
      (eventDigest) => {
        if (!eventDigest.ok) return eventDigest;
        const accepted = snapshot({
          ...base,
          eventDigest: eventDigest.value,
        }) as unknown as AcceptedProjectEvent;
        admissionReceipts.add(accepted);
        return { ok: true, value: accepted as ProjectAdmissionReceipt };
      },
    );
  });
};

export const admitProjectEvent = (
  ...[input, authority, digester, context = { currentEvents: [], latestAdmittedAt: null }]: [
    unknown,
    AdmissionAuthority,
    ProjectContentDigester,
    AdmissionDecisionContext?,
  ]
): MaybePromise<ProjectResult<ProjectAdmissionReceipt>> => {
  const validated = validateAdmissionRequest(input);
  if (!validated.ok) return validated;
  const request: AdmissionRequest = validated.value;
  const admission = { authority, digester, request };
  return maybeThen(decide(request, authority, context), (decision) =>
    decision.ok ? admitDecidedEvent(decision.value, admission) : decision,
  );
};
