import { isJsonValue, type JsonObject, type JsonValue } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";

export const AI_SDLC_API_VERSION = "ai-sdlc.io/v1alpha1" as const;
export const DECISION_SCHEMA_ID =
  "https://ai-sdlc.io/schemas/v1alpha1/decision.v1.schema.json" as const;
export const ATTESTATION_SCHEMA_ID =
  "https://ai-sdlc.io/schemas/v1alpha1/attestation-envelope-v6.schema.json" as const;

export interface ParsedAiSdlcDecision {
  readonly type: "decision";
  readonly document: JsonObject;
  readonly decisionId: string;
  readonly summary: string;
  readonly dependsOn: readonly string[];
}

export interface ParsedAiSdlcAttestation {
  readonly type: "attestation";
  readonly document: JsonObject;
  readonly subjectSha: string;
}

export type ParsedAiSdlcDocument = ParsedAiSdlcDecision | ParsedAiSdlcAttestation;

const fail = (message: string): never => {
  throw new TypeError(`AI-SDLC schema validation failed: ${message}.`);
};

type RecordShape = readonly [optional: readonly string[], label: string];

const record = (
  value: unknown,
  required: readonly string[],
  shape: RecordShape = [[], "object"],
): Record<string, unknown> => {
  const [optional, label] = shape;
  if (!isPortableRecord(value) || !hasOnlyKeys(value, required, optional)) {
    fail(`${label} must use its exact Draft 2020-12 property set`);
  }
  return value as Record<string, unknown>;
};

const nonBlank = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} must be non-blank`);
  return value as string;
};

const nonEmpty = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be non-empty`);
  return value as string;
};

const leapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(z|([+-])(\d{2})(?::?(\d{2}))?)$/i;

/** Match the RFC 3339 `date-time` assertion used for the pinned schemas. */
const dateTime = (value: unknown, label: string): void => {
  if (typeof value !== "string") fail(`${label} must be a date-time string`);
  const text = value as string;
  const parts = text.split(/t|\s/i);
  const dateMatch = parts.length === 2 ? datePattern.exec(parts[0]!) : null;
  const timeMatch = parts.length === 2 ? timePattern.exec(parts[1]!) : null;
  if (dateMatch === null || timeMatch === null) fail(`${label} must be a valid date-time`);
  const matchedDate = dateMatch as RegExpExecArray;
  const matchedTime = timeMatch as RegExpExecArray;

  const year = Number(matchedDate[1]);
  const month = Number(matchedDate[2]);
  const day = Number(matchedDate[3]);
  const days = [0, 31, leapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month]!) {
    fail(`${label} must be a valid date-time`);
  }

  const hour = Number(matchedTime[1]);
  const minute = Number(matchedTime[2]);
  const second = Number(matchedTime[3]);
  const sign = matchedTime[5] === "-" ? -1 : 1;
  const offsetHour = Number(matchedTime[6] ?? 0);
  const offsetMinute = Number(matchedTime[7] ?? 0);
  if (offsetHour > 23 || offsetMinute > 59) fail(`${label} must be a valid date-time`);
  if (hour <= 23 && minute <= 59 && second < 60) return;

  const utcMinute = minute - offsetMinute * sign;
  const utcHour = hour - offsetHour * sign - (utcMinute < 0 ? 1 : 0);
  if (
    (utcHour !== 23 && utcHour !== -1) ||
    (utcMinute !== 59 && utcMinute !== -1) ||
    second >= 61
  ) {
    fail(`${label} must be a valid date-time`);
  }
};

const nullableText = (value: unknown, label: string): void => {
  if (value !== undefined && value !== null && typeof value !== "string") {
    fail(`${label} must be a string or null`);
  }
};

const nullableTimestamp = (value: unknown, label: string): void => {
  if (value !== undefined && value !== null) dateTime(value, label);
};

const strings = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    fail(`${label} must be a string array`);
  }
  return value as string[];
};

const optionalNumber = (
  value: unknown,
  label: string,
  range: readonly [minimum: number, maximum: number],
): void => {
  const [minimum, maximum] = range;
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
  ) {
    fail(`${label} must be between ${minimum} and ${maximum}`);
  }
};

const decisionPattern = /^DEC-\d{4,}$/;
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
const hex40 = /^[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;

const validateOption = (value: unknown): string => {
  const option = record(
    value,
    ["id", "description"],
    [["consequences", "dependents", "subDecisions"], "Decision option"],
  );
  const id = nonBlank(option.id, "Decision option id");
  if (!slugPattern.test(id)) fail("Decision option id must be a slug");
  nonEmpty(option.description, "Decision option description");
  if (option.consequences !== undefined) strings(option.consequences, "option consequences");
  if (option.dependents !== undefined) strings(option.dependents, "option dependents");
  if (option.subDecisions !== undefined) strings(option.subDecisions, "option sub-decisions");
  return id;
};

const validateDecisionMetadata = (value: unknown): string => {
  const metadata = record(
    value,
    ["id", "source", "scope", "created", "updated"],
    [[], "Decision metadata"],
  );
  const id = nonBlank(metadata.id, "Decision id");
  if (!decisionPattern.test(id)) fail("Decision id must match DEC-NNNN");
  if (
    ![
      "dor-clarification",
      "rfc-open-question",
      "emergent-finding",
      "framework-calibration",
      "subagent-escalation",
      "ad-hoc",
    ].includes(String(metadata.source))
  ) {
    fail("Decision source is not recognized");
  }
  if (typeof metadata.scope !== "string") fail("Decision scope must be text");
  dateTime(metadata.created, "Decision created");
  dateTime(metadata.updated, "Decision updated");
  return id;
};

const validateDecisionSpec = (
  value: unknown,
): { readonly summary: string; readonly dependsOn: readonly string[] } => {
  const spec = record(
    value,
    ["summary", "options"],
    [
      [
        "body",
        "reversible",
        "dependsOn",
        "timebox",
        "priority",
        "impactScore",
        "autonomousFallbackOptionId",
        "contextRef",
      ],
      "Decision spec",
    ],
  );
  const summary = nonEmpty(spec.summary, "Decision summary");
  if (spec.body !== undefined && typeof spec.body !== "string") fail("Decision body must be text");
  if (spec.reversible !== undefined && typeof spec.reversible !== "boolean") {
    fail("Decision reversible must be boolean");
  }
  if (!Array.isArray(spec.options) || spec.options.length === 0) {
    fail("Decision options must be non-empty");
  }
  (spec.options as unknown[]).forEach(validateOption);
  const dependsOn =
    spec.dependsOn === undefined ? [] : strings(spec.dependsOn, "Decision dependsOn");
  if (spec.timebox !== undefined && typeof spec.timebox !== "string") {
    fail("Decision timebox must be text");
  }
  if (
    spec.priority !== undefined &&
    !["critical", "high", "medium", "low"].includes(String(spec.priority))
  ) {
    fail("Decision priority is invalid");
  }
  optionalNumber(spec.impactScore, "Decision impactScore", [0, 100]);
  if (spec.autonomousFallbackOptionId !== undefined) {
    const fallback = nonBlank(spec.autonomousFallbackOptionId, "Decision fallback option");
    if (!slugPattern.test(fallback)) fail("Decision fallback option must be a slug");
  }
  if (spec.contextRef !== undefined && typeof spec.contextRef !== "string") {
    fail("Decision contextRef must be text");
  }
  return { summary, dependsOn };
};

const validateRouting = (value: unknown): void => {
  if (value === undefined) return;
  const routing = record(
    value,
    [],
    [["assignedActor", "actorRationale", "llmEligible"], "Decision routing"],
  );
  nullableText(routing.assignedActor, "routing assignedActor");
  nullableText(routing.actorRationale, "routing actorRationale");
  if (routing.llmEligible !== undefined && typeof routing.llmEligible !== "boolean") {
    fail("routing llmEligible must be boolean");
  }
};

const validateDecisionStatus = (value: unknown): void => {
  const status = record(
    value,
    ["lifecycle"],
    [
      [
        "answeredOptionId",
        "answeredBy",
        "answeredAt",
        "supersededBy",
        "routing",
        "evaluation",
        "priority",
        "capacity",
        "deadline",
        "timeboxExpiresAt",
      ],
      "Decision status",
    ],
  );
  if (
    !["proposed", "open", "deferred", "answered", "superseded", "archived"].includes(
      String(status.lifecycle),
    )
  ) {
    fail("Decision lifecycle is invalid");
  }
  nullableText(status.answeredOptionId, "answeredOptionId");
  nullableText(status.answeredBy, "answeredBy");
  nullableTimestamp(status.answeredAt, "answeredAt");
  nullableText(status.supersededBy, "supersededBy");
  validateRouting(status.routing);
  if (status.evaluation !== undefined && !isPortableRecord(status.evaluation)) {
    fail("Decision evaluation must be an object");
  }
  if (status.priority !== undefined && status.priority !== null) {
    optionalNumber(status.priority, "Decision status priority", [0, 1]);
  }
  if (status.capacity !== undefined) {
    const capacity = record(status.capacity, [], [["tier"], "Decision capacity"]);
    if (
      capacity.tier !== undefined &&
      !["xs", "s", "m", "l", "xl"].includes(String(capacity.tier))
    ) {
      fail("Decision capacity tier is invalid");
    }
  }
  nullableTimestamp(status.deadline, "Decision deadline");
  nullableTimestamp(status.timeboxExpiresAt, "Decision timebox expiry");
};

const validateDecisionLog = (value: unknown): void => {
  if (value === undefined) return;
  if (!Array.isArray(value)) fail("Decision log must be an array");
  (value as unknown[]).forEach((entry) => {
    if (!isPortableRecord(entry)) fail("Decision log entries must be objects");
    const event = entry as Record<string, unknown>;
    if (
      event.eventVersion !== "v1" ||
      ![
        "decision-opened",
        "recommendation-issued",
        "stage-c-completed",
        "operator-answered",
        "timebox-fired",
        "timebox-extended",
        "overridden",
        "calibration-adjusted",
        "superseded",
        "deferred",
        "archived",
        "dedup-merged",
        "routing-changed",
      ].includes(String(event.type)) ||
      !decisionPattern.test(nonBlank(event.decisionId, "Decision log decisionId"))
    ) {
      fail("Decision log entry is invalid");
    }
    dateTime(event.ts, "Decision log timestamp");
    if (event.by !== undefined && typeof event.by !== "string") {
      fail("Decision log by must be text");
    }
  });
};

const parseDecision = (value: JsonObject): ParsedAiSdlcDecision => {
  const document = record(
    value,
    ["apiVersion", "kind", "metadata", "spec", "status"],
    [["decisionLog"], "Decision"],
  );
  if (document.apiVersion !== AI_SDLC_API_VERSION || document.kind !== "Decision") {
    fail("Decision apiVersion/kind does not match its schema");
  }
  const decisionId = validateDecisionMetadata(document.metadata);
  const { summary, dependsOn } = validateDecisionSpec(document.spec);
  validateDecisionStatus(document.status);
  validateDecisionLog(document.decisionLog);
  return cloneFrozen({ type: "decision", document: value, decisionId, summary, dependsOn });
};

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || Number(value) < 0)
    fail(`${label} must be a non-negative integer`);
  return Number(value);
};

const parseAttestation = (value: JsonObject): ParsedAiSdlcAttestation => {
  const document = record(
    value,
    [
      "schemaVersion",
      "subject",
      "transcriptLeaves",
      "merkleProofs",
      "rootHash",
      "rootSignature",
      "nonce",
      "leafCount",
      "signedAt",
    ],
    [["signerIdentity"], "AttestationEnvelopeV6"],
  );
  if (document.schemaVersion !== "v6") fail("attestation schemaVersion must be v6");
  const subject = record(document.subject, ["digest"], [[], "attestation subject"]);
  const subjectDigest = record(subject.digest, ["sha1"], [[], "attestation subject digest"]);
  const subjectSha = nonBlank(subjectDigest.sha1, "attestation subject sha1");
  if (!hex40.test(subjectSha)) fail("attestation subject sha1 must be lowercase hex");
  const leafCount = nonNegativeInteger(document.leafCount, "attestation leafCount");
  if (leafCount < 1) fail("attestation leafCount must be positive");
  if (!Array.isArray(document.transcriptLeaves))
    fail("attestation transcriptLeaves must be an array");
  (document.transcriptLeaves as unknown[]).forEach((leaf) => {
    const item = record(
      leaf,
      ["leafIndex", "reviewerName", "transcriptHash"],
      [[], "attestation transcript leaf"],
    );
    nonNegativeInteger(item.leafIndex, "transcript leaf index");
    nonEmpty(item.reviewerName, "transcript reviewer name");
    if (!hex64.test(nonBlank(item.transcriptHash, "transcript hash"))) {
      fail("transcript hash must be SHA-256 hex");
    }
  });
  if (!Array.isArray(document.merkleProofs)) fail("attestation merkleProofs must be an array");
  (document.merkleProofs as unknown[]).forEach((proof) => {
    const item = record(proof, ["leafIndex", "proof"], [[], "attestation Merkle proof"]);
    nonNegativeInteger(item.leafIndex, "Merkle proof leaf index");
    if (
      !Array.isArray(item.proof) ||
      !item.proof.every((hash) => typeof hash === "string" && hex64.test(hash))
    ) {
      fail("Merkle proof must contain SHA-256 sibling hashes");
    }
  });
  if (!hex64.test(nonBlank(document.rootHash, "attestation rootHash")))
    fail("rootHash must be SHA-256 hex");
  nonEmpty(document.rootSignature, "attestation rootSignature");
  if (!hex64.test(nonBlank(document.nonce, "attestation nonce"))) fail("nonce must be 32-byte hex");
  if (document.signerIdentity !== undefined && typeof document.signerIdentity !== "string") {
    fail("attestation signerIdentity must be text");
  }
  dateTime(document.signedAt, "attestation signedAt");
  return cloneFrozen({ type: "attestation", document: value, subjectSha });
};

export const parseAiSdlcDocument = (input: JsonValue): ParsedAiSdlcDocument => {
  if (!isJsonValue(input) || !isPortableRecord(input)) {
    fail("input must be closed portable JSON");
  }
  const value = cloneFrozen(input) as JsonObject;
  if (value.apiVersion === AI_SDLC_API_VERSION && value.kind === "Decision") {
    return parseDecision(value);
  }
  if (value.schemaVersion === "v6") return parseAttestation(value);
  return fail("supported inventory is Decision v1 and AttestationEnvelopeV6 only");
};
