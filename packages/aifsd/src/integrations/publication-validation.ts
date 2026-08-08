import { snapshot, StrictJsonError } from "@geekist/strict-json";
import { isDigest } from "@geekist/llm-core/contracts";
import type { IntegrationResult, PublicationAdmission, PublicationAuthority } from "./contract.js";

const trusts = new Set(["community", "verified", "official"]);
const keys = [
  "authorityId",
  "decisionId",
  "integrationName",
  "integrationVersion",
  "manifestDigest",
  "qualificationEvidenceDigest",
  "catalogSubjectDigest",
  "trust",
  "decidedAt",
  "signature",
] as const;

export const validatePublicationAdmission = (
  input: unknown,
  authority: PublicationAuthority,
): IntegrationResult<PublicationAdmission> => {
  let value: unknown;
  try {
    value = snapshot(input);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "publication-admission-invalid",
          reasonCode: error instanceof StrictJsonError ? error.code : "inspection-failed",
        },
      ],
    };
  }
  const record = value as Record<string, unknown>;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(record).length !== keys.length ||
    !Object.keys(record).every((key) => (keys as readonly string[]).includes(key)) ||
    record.authorityId !== authority.authorityId ||
    typeof record.decisionId !== "string" ||
    record.decisionId.length === 0 ||
    typeof record.integrationName !== "string" ||
    record.integrationName.length === 0 ||
    typeof record.integrationVersion !== "string" ||
    record.integrationVersion.length === 0 ||
    !isDigest(record.manifestDigest) ||
    !isDigest(record.qualificationEvidenceDigest) ||
    !isDigest(record.catalogSubjectDigest) ||
    typeof record.trust !== "string" ||
    !trusts.has(record.trust) ||
    typeof record.decidedAt !== "string" ||
    !Number.isFinite(Date.parse(record.decidedAt)) ||
    typeof record.signature !== "string" ||
    record.signature.length === 0
  ) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "publication-admission-invalid",
          reasonCode: "closed-authority-admission-required",
        },
      ],
    };
  }
  return { ok: true, value: record as unknown as PublicationAdmission };
};
