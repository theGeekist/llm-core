import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isJsonValue,
  isNativeExtensions,
  isSchemaRef,
} from "#contracts";
import type { ModelProfile } from "./profile";

/**
 * Deep structural validation for a profile before it is branded
 * `RegisteredModelProfile`. Runs on the already-cloned value so what is
 * validated is exactly what gets frozen and trusted by the resolver.
 *
 * Objects are CLOSED (ADR-003): every object rejects undeclared keys, so a
 * stray `credential` or a physical evidence locator (`signedUrl`, path, bucket)
 * cannot ride along in a profile or its evidence. Only the declared `extensions`
 * maps are open, and those are constrained to strict JSON under reverse-DNS
 * namespaces. Contract-owned shapes reuse the contracts' guards; only the
 * capability-id / media-type / date-time patterns (no runtime guard exists) are
 * checked locally, inside this slice's write scope.
 */

const CAPABILITY_ID = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- RFC token and quoted-string grammar are intentionally explicit
  /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+\/[!#$%&'*+\-.^_`|~A-Za-z0-9]+(?:[ \t]*;[ \t]*[!#$%&'*+\-.^_`|~A-Za-z0-9]+[ \t]*=[ \t]*(?:[!#$%&'*+\-.^_`|~A-Za-z0-9]+|"(?:[\t \x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t \x21-\x7e\x80-\xff])*"))*$/;
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

const EVIDENCE_KINDS: ReadonlySet<string> = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);

const EVIDENCE_BASE_KEYS = [
  "report",
  "suiteId",
  "suiteVersion",
  "observedAt",
  "implementationId",
  "implementationVersion",
  "providerId",
  "providerVersion",
  "contractSchema",
  "extensions",
  "result",
] as const;

const CLAIM_BASE_KEYS = [
  "capabilityId",
  "version",
  "additionalEvidence",
  "extensions",
  "status",
  "evidence",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (record: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const permitted = new Set<string>(allowed);
  return Object.keys(record).every((key) => permitted.has(key));
};

const isCapabilityId = (value: unknown): boolean =>
  typeof value === "string" && CAPABILITY_ID.test(value);
const isImplementationId = (value: unknown): boolean =>
  typeof value === "string" && isExternalId(value);
const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const shiftCalendarDate = (date: CalendarDate, shift: -1 | 0 | 1): CalendarDate => {
  const { year, month, day } = date;
  if (shift === 0) return date;
  if (shift === 1) {
    if (day < daysInMonth(year, month)) return { year, month, day: day + 1 };
    if (month < 12) return { year, month: month + 1, day: 1 };
    return { year: year + 1, month: 1, day: 1 };
  }
  if (day > 1) return { year, month, day: day - 1 };
  if (month > 1) {
    const previousMonth = month - 1;
    return { year, month: previousMonth, day: daysInMonth(year, previousMonth) };
  }
  return { year: year - 1, month: 12, day: 31 };
};

const isPossibleLeapSecond = (
  date: CalendarDate,
  time: { hour: number; minute: number; offsetMinutes: number },
): boolean => {
  const { hour, minute, offsetMinutes } = time;
  const utcMinutesUnbounded = hour * 60 + minute - offsetMinutes;
  const dayShift = utcMinutesUnbounded < 0 ? -1 : utcMinutesUnbounded >= 1_440 ? 1 : 0;
  const utcMinutes = (utcMinutesUnbounded + 1_440) % 1_440;
  const utcDate = shiftCalendarDate(date, dayShift);
  return (
    utcMinutes === 23 * 60 + 59 &&
    ((utcDate.month === 6 && utcDate.day === 30) || (utcDate.month === 12 && utcDate.day === 31))
  );
};

const isDateTime = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (!match) return false;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] = match;
  const offsetHourValue = match[8];
  const offsetMinuteValue = match[9];
  if (
    yearValue === undefined ||
    monthValue === undefined ||
    dayValue === undefined ||
    hourValue === undefined ||
    minuteValue === undefined ||
    secondValue === undefined
  ) {
    return false;
  }

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const offsetSign = match[7] === "-" ? -1 : 1;
  const offsetHour = offsetHourValue === undefined ? 0 : Number(offsetHourValue);
  const offsetMinute = offsetMinuteValue === undefined ? 0 : Number(offsetMinuteValue);
  const offsetMinutes = offsetSign * (offsetHour * 60 + offsetMinute);

  const hasValidFields =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59;
  return (
    hasValidFields &&
    (second < 60 || isPossibleLeapSecond({ year, month, day }, { hour, minute, offsetMinutes }))
  );
};
const isMediaType = (value: unknown): boolean =>
  typeof value === "string" && MEDIA_TYPE.test(value);
const isByteLength = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isResourceRef = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  isMediaType(value.mediaType) &&
  isByteLength(value.byteLength) &&
  isDigest(value.digest);

const isEvidenceRef = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["evidenceId", "kind", "content", "schema"]) &&
  isCanonicalUuid(value.evidenceId) &&
  typeof value.kind === "string" &&
  EVIDENCE_KINDS.has(value.kind) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isSchemaRef(value.schema));

const isConstraint = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["name", "value"]) &&
  typeof value.name === "string" &&
  isJsonValue(value.value);

const isConstraintList = (value: unknown, minItems: number): boolean =>
  Array.isArray(value) && value.length >= minItems && value.every(isConstraint);

const isEvidenceBase = (evidence: Record<string, unknown>): boolean =>
  isEvidenceRef(evidence.report) &&
  isCapabilityId(evidence.suiteId) &&
  isContractVersion(evidence.suiteVersion) &&
  isDateTime(evidence.observedAt) &&
  isImplementationId(evidence.implementationId) &&
  typeof evidence.implementationVersion === "string" &&
  (evidence.providerId === undefined || isImplementationId(evidence.providerId)) &&
  (evidence.providerVersion === undefined || typeof evidence.providerVersion === "string") &&
  (evidence.contractSchema === undefined || isSchemaRef(evidence.contractSchema)) &&
  (evidence.extensions === undefined || isNativeExtensions(evidence.extensions));

const isPassingEvidence = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, EVIDENCE_BASE_KEYS) &&
  value.result === "pass" &&
  isEvidenceBase(value);
const isPartialEvidence = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, [...EVIDENCE_BASE_KEYS, "limitations"]) &&
  value.result === "partial" &&
  isEvidenceBase(value) &&
  isConstraintList(value.limitations, 1);
const isFailedEvidence = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, [...EVIDENCE_BASE_KEYS, "failures"]) &&
  value.result === "fail" &&
  isEvidenceBase(value) &&
  isConstraintList(value.failures, 1);
const isAnyEvidence = (value: unknown): boolean =>
  isPassingEvidence(value) || isPartialEvidence(value) || isFailedEvidence(value);

const isClaimBase = (claim: Record<string, unknown>): boolean =>
  isCapabilityId(claim.capabilityId) &&
  isContractVersion(claim.version) &&
  (claim.additionalEvidence === undefined ||
    (Array.isArray(claim.additionalEvidence) && claim.additionalEvidence.every(isAnyEvidence))) &&
  (claim.extensions === undefined || isNativeExtensions(claim.extensions));

const isValidClaim = (value: unknown): boolean => {
  if (!isRecord(value) || !isClaimBase(value)) {
    return false;
  }
  switch (value.status) {
    case "supported":
      return hasOnlyKeys(value, CLAIM_BASE_KEYS) && isPassingEvidence(value.evidence);
    case "conditional":
      return (
        hasOnlyKeys(value, [...CLAIM_BASE_KEYS, "conditions"]) &&
        (isPassingEvidence(value.evidence) || isPartialEvidence(value.evidence)) &&
        isConstraintList(value.conditions, 1)
      );
    case "unsupported":
      return hasOnlyKeys(value, CLAIM_BASE_KEYS) && isFailedEvidence(value.evidence);
    default:
      return false;
  }
};

/** Throw a `TypeError` if `profile` is not a fully valid, closed portable profile. */
export const validateModelProfileValue = (profile: ModelProfile): void => {
  const value: unknown = profile;
  if (!isRecord(value)) {
    throw new TypeError("ModelProfile must be an object.");
  }
  if (
    !hasOnlyKeys(value, [
      "profileId",
      "version",
      "model",
      "provider",
      "deployment",
      "claims",
      "schema",
      "extensions",
    ])
  ) {
    throw new TypeError("ModelProfile contains undeclared keys; portable objects are closed.");
  }
  if (
    !isImplementationId(value.profileId) ||
    !isImplementationId(value.model) ||
    !isImplementationId(value.provider) ||
    !isImplementationId(value.deployment)
  ) {
    throw new TypeError("ModelProfile references must be 1–255 printable-ASCII identifiers.");
  }
  if (!isContractVersion(value.version)) {
    throw new TypeError("ModelProfile.version must be a SemVer contract version.");
  }
  if (!Array.isArray(value.claims) || !value.claims.every(isValidClaim)) {
    throw new TypeError("ModelProfile.claims must be an array of valid, closed capability claims.");
  }
  if (value.schema !== undefined && !isSchemaRef(value.schema)) {
    throw new TypeError("ModelProfile.schema must be a valid SchemaRef.");
  }
  if (value.extensions !== undefined && !isNativeExtensions(value.extensions)) {
    throw new TypeError(
      "ModelProfile.extensions must be strict JSON keyed by reverse-DNS namespaces.",
    );
  }
};
