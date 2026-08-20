import { snapshot } from "@aifsd/strict-json";
import type {
  AcceptedProjectEvent,
  AdmissionDecision,
  AdmissionAuthority,
  AdmissionRequest,
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

export const admitProjectEvent = async (
  input: unknown,
  authority: AdmissionAuthority,
  digester: ProjectContentDigester,
): Promise<ProjectResult<ProjectAdmissionReceipt>> => {
  const validated = validateAdmissionRequest(input);
  if (!validated.ok) return validated;
  const request: AdmissionRequest = validated.value;
  const proposedDecision: AdmissionDecision | null = await authority.decide(request);
  if (proposedDecision === null) {
    return {
      ok: false,
      diagnostics: [{ code: "admission-denied", reasonCode: "authority-denied" }],
    };
  }
  const decision = validateAdmissionDecision(proposedDecision, request.observation);
  if (!decision.ok) return decision;
  if (decision.value.authority.authorityId !== authority.authorityId) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-admission", reasonCode: "authority-mismatch" }],
    };
  }
  const observation = request.observation;
  const payload = snapshot(observation.payload);
  const payloadDigest = await digester.digest(payload);
  const base: Omit<AcceptedProjectEvent, "eventDigest"> = {
    eventId: request.eventId,
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
    payloadDigest,
  };
  const eventDigest = await digester.digest(acceptedEventIdentityInput(base));
  const accepted = snapshot({ ...base, eventDigest }) as unknown as AcceptedProjectEvent;
  admissionReceipts.add(accepted);
  return { ok: true, value: accepted as ProjectAdmissionReceipt };
};
