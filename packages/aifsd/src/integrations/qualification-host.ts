import type {
  QualificationExecutorAuthority,
  QualificationExecutorRegistration,
  QualificationService,
} from "./contract.js";

export interface QualificationServiceState {
  readonly authority: QualificationExecutorAuthority;
  readonly registrations: readonly QualificationExecutorRegistration[];
}

const qualificationServices = new WeakMap<QualificationService, QualificationServiceState>();

export const createQualificationService = (
  authority: QualificationExecutorAuthority,
  registrations: readonly QualificationExecutorRegistration[],
): QualificationService => {
  const service = Object.freeze({ authorityId: authority.authorityId });
  qualificationServices.set(service, {
    authority,
    registrations: Object.freeze([...registrations]),
  });
  return service;
};

export const qualificationServiceState = (
  service: QualificationService,
): QualificationServiceState | undefined => qualificationServices.get(service);
