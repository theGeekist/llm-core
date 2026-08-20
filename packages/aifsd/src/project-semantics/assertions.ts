import { normalize, type JsonValue } from "@aifsd/strict-json";
import { isCanonicalUuid, isExternalId } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  MaterialisedAssertion,
  ProjectAssertion,
  ProjectAuthority,
  ProjectAuthorityKind,
  ProjectResult,
} from "./contract.js";

const isRecord = (value: unknown): value is { [key: string]: JsonValue } =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

const authorityKinds = new Set<ProjectAuthorityKind>([
  "human",
  "coordinator",
  "worker",
  "integration",
  "plugin",
]);

const hasExactKeys = (
  record: { [key: string]: JsonValue },
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in record) && Object.keys(record).every((key) => allowed.has(key))
  );
};

const isAuthority = (value: JsonValue | undefined): boolean =>
  isRecord(value) &&
  hasExactKeys(value, ["authorityId", "kind"], ["delegationId"]) &&
  typeof value.authorityId === "string" &&
  isExternalId(value.authorityId) &&
  typeof value.kind === "string" &&
  authorityKinds.has(value.kind as ProjectAuthorityKind) &&
  (value.delegationId === undefined ||
    (typeof value.delegationId === "string" && isExternalId(value.delegationId)));

const assertionFrom = (
  value: JsonValue,
  event: AcceptedProjectEvent,
): ProjectResult<ProjectAssertion> => {
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
    };
  }
  if (
    !hasExactKeys(
      value,
      ["assertionId", "subjectId", "predicate", "object", "authority", "evidence", "validFrom"],
      ["validTo"],
    )
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
    };
  }
  const authority = value.authority as unknown as ProjectAuthority;
  if (
    typeof value.assertionId !== "string" ||
    !isExternalId(value.assertionId) ||
    typeof value.subjectId !== "string" ||
    !isExternalId(value.subjectId) ||
    typeof value.predicate !== "string" ||
    !isExternalId(value.predicate) ||
    !("object" in value) ||
    !isAuthority(value.authority) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    value.evidence.some((item) => !isCanonicalUuid(item)) ||
    new Set(value.evidence).size !== value.evidence.length ||
    !isTimestamp(value.validFrom) ||
    (value.validTo !== undefined && !isTimestamp(value.validTo))
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
    };
  }
  if (
    typeof value.validTo === "string" &&
    Date.parse(value.validTo) <= Date.parse(value.validFrom)
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
    };
  }
  if (
    authority.authorityId !== event.sourceAuthority.authorityId ||
    authority.kind !== event.sourceAuthority.kind ||
    authority.delegationId !== event.sourceAuthority.delegationId ||
    !(value.evidence as readonly string[]).every((evidenceId) =>
      event.evidence.includes(evidenceId as (typeof event.evidence)[number]),
    )
  ) {
    return {
      ok: false,
      diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-source-mismatch" }],
    };
  }
  return {
    ok: true,
    value: {
      assertionId: value.assertionId,
      subjectId: value.subjectId,
      predicate: value.predicate,
      object: value.object as JsonValue,
      sourceEventId: event.eventId,
      authority,
      evidence: value.evidence as unknown as ProjectAssertion["evidence"],
      validFrom: value.validFrom,
      ...(typeof value.validTo === "string" ? { validTo: value.validTo } : {}),
    },
  };
};

export const materialiseAssertions = (
  events: readonly AcceptedProjectEvent[],
): ProjectResult<readonly MaterialisedAssertion[]> => {
  const assertions = new Map<string, MaterialisedAssertion>();
  for (const event of events) {
    let payload: JsonValue;
    try {
      payload = normalize(event.payload);
    } catch {
      return {
        ok: false,
        diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
      };
    }
    if (!isRecord(payload)) {
      if (event.kind === "assertions.recorded" || event.kind === "assertions.retracted") {
        return invalidAssertionEvent();
      }
      continue;
    }
    const applied = applyAssertionEvent(assertions, event, payload);
    if (!applied.ok) return applied;
  }
  return {
    ok: true,
    value: [...assertions.values()].sort((left, right) =>
      left.assertionId < right.assertionId ? -1 : left.assertionId > right.assertionId ? 1 : 0,
    ),
  };
};

const invalidAssertionEvent = (): ProjectResult<never> => ({
  ok: false,
  diagnostics: [{ code: "assertion-invalid", reasonCode: "assertion-shape-invalid" }],
});

const recordAssertions = (
  assertions: Map<string, MaterialisedAssertion>,
  event: AcceptedProjectEvent,
  values: JsonValue,
): ProjectResult<null> => {
  if (!Array.isArray(values) || values.length === 0) return invalidAssertionEvent();
  for (const value of values) {
    const assertion = assertionFrom(value, event);
    if (!assertion.ok) return assertion;
    if (assertions.has(assertion.value.assertionId)) return invalidAssertionEvent();
    assertions.set(assertion.value.assertionId, {
      ...assertion.value,
      retractedBy: null,
    });
  }
  return { ok: true, value: null };
};

const retractAssertions = (
  assertions: Map<string, MaterialisedAssertion>,
  event: AcceptedProjectEvent,
  values: JsonValue,
): ProjectResult<null> => {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || !isExternalId(value)) ||
    new Set(values).size !== values.length
  ) {
    return invalidAssertionEvent();
  }
  for (const assertionId of values as string[]) {
    const current = assertions.get(assertionId);
    if (current === undefined || current.retractedBy !== null) return invalidAssertionEvent();
    assertions.set(assertionId, { ...current, retractedBy: event.eventId });
  }
  return { ok: true, value: null };
};

const applyAssertionEvent = (
  assertions: Map<string, MaterialisedAssertion>,
  event: AcceptedProjectEvent,
  payload: { [key: string]: JsonValue },
): ProjectResult<null> => {
  if (event.kind === "assertions.recorded") {
    if (!hasExactKeys(payload, ["assertions"])) return invalidAssertionEvent();
    return recordAssertions(assertions, event, payload.assertions as JsonValue);
  }
  if (event.kind === "assertions.retracted") {
    if (!hasExactKeys(payload, ["assertionIds"])) return invalidAssertionEvent();
    return retractAssertions(assertions, event, payload.assertionIds as JsonValue);
  }
  return { ok: true, value: null };
};
