import type {
  IntegrationTrustService,
  PublicationAuthority,
  QualificationExecutorAuthority,
} from "./contract.js";

export interface IntegrationTrustServiceState {
  readonly qualificationAuthority: QualificationExecutorAuthority;
  readonly publicationAuthority: PublicationAuthority;
}

const trustServices = new WeakMap<IntegrationTrustService, IntegrationTrustServiceState>();

export const createIntegrationTrustService = (
  qualificationAuthority: QualificationExecutorAuthority,
  publicationAuthority: PublicationAuthority,
): IntegrationTrustService => {
  const service = Object.freeze({
    qualificationAuthorityId: qualificationAuthority.authorityId,
    publicationAuthorityId: publicationAuthority.authorityId,
  });
  trustServices.set(service, { qualificationAuthority, publicationAuthority });
  return service;
};

export const integrationTrustServiceState = (
  service: IntegrationTrustService,
): IntegrationTrustServiceState | undefined => trustServices.get(service);
