// Durable manifest validation (Layer 1 ConfigurationIntent + Layer 2 Selection). The
// manifest is closed data: unknown keys, non-portable values, live objects and
// raw secrets are rejected before anything downstream trusts it
// (CONFIGURATION.md Layers 1-2, ADR-003, ADR-007).
//
// This validator is snapshot-first and returns frozen output: it never reads a
// caller-supplied accessor during validation (a hostile getter cannot observe
// or mutate the value mid-check), and the accepted Manifest is deep-frozen so
// the caller keeps no mutable handle into durable configuration.

import type {
  ConfigurationResult,
  ConfigurationDiagnostic,
  EnvironmentOverlay,
  ConfigurationIntent,
  Manifest,
  Selection,
  SelectionKind,
} from "./contract.js";
import {
  captureConfigurationData,
  diagnostic,
  freezeConfigurationData,
  isObjectRecord,
  unexpectedFieldDiagnostics,
} from "./diagnostics.js";
import {
  isTrustLevel,
  meetsTrust,
  selectionCoordinate,
  validateSelectionSecrets,
  validateSelectionSettings,
} from "./selection.js";

const SELECTION_KINDS: readonly SelectionKind[] = ["template", "integration"];
const SUPPORTED_SCHEMA_VERSION = "1.0.0";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const validateIntent = (value: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(value)) {
    return [diagnostic("non-portable-value", "expected-object", path)];
  }
  const diagnostics = unexpectedFieldDiagnostics(value, ["summary", "outcomes"], path);
  if (typeof value.summary !== "string") {
    diagnostics.push(diagnostic("non-portable-value", "expected-string", `${path}/summary`));
  }
  if (!isStringArray(value.outcomes)) {
    diagnostics.push(diagnostic("non-portable-value", "expected-string-array", `${path}/outcomes`));
  }
  return diagnostics;
};

const SELECTION_KEYS = ["kind", "name", "versionRange", "trust", "secrets", "settings"];

// A record slot (secrets/settings) must be a plain object; an array or any
// other non-plain shape is rejected rather than crashing a later guard.
const validateRecordSlot = (
  value: unknown,
  path: string,
): {
  readonly diagnostics: ConfigurationDiagnostic[];
  readonly record?: Record<string, unknown>;
} => {
  if (value === undefined) {
    return { diagnostics: [] };
  }
  if (!isObjectRecord(value)) {
    return {
      diagnostics: [diagnostic("non-portable-value", "expected-plain-object", path)],
    };
  }
  return { diagnostics: [], record: value };
};

// A trust requirement is a CLOSED object: exactly { minimum: <valid level> }.
const validateTrustRequirement = (value: unknown, path: string): ConfigurationDiagnostic[] => {
  if (value === undefined) {
    return [];
  }
  if (!isObjectRecord(value)) {
    return [diagnostic("non-portable-value", "expected-object", path)];
  }
  const diagnostics: ConfigurationDiagnostic[] = unexpectedFieldDiagnostics(
    value,
    ["minimum"],
    path,
  );
  if (!isTrustLevel(value.minimum)) {
    diagnostics.push(diagnostic("non-portable-value", "invalid-enum-value", `${path}/minimum`));
  }
  return diagnostics;
};

const validateSelection = (value: unknown, path: string): ConfigurationDiagnostic[] => {
  if (!isObjectRecord(value)) {
    return [diagnostic("non-portable-value", "expected-object", path)];
  }
  const diagnostics = unexpectedFieldDiagnostics(value, SELECTION_KEYS, path);
  if (!SELECTION_KINDS.includes(value.kind as SelectionKind)) {
    diagnostics.push(diagnostic("non-portable-value", "invalid-enum-value", `${path}/kind`));
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    diagnostics.push(diagnostic("non-portable-value", "expected-non-empty-string", `${path}/name`));
  }
  if (typeof value.versionRange !== "string" || value.versionRange.length === 0) {
    diagnostics.push(
      diagnostic("non-portable-value", "expected-non-empty-string", `${path}/versionRange`),
    );
  }
  diagnostics.push(...validateTrustRequirement(value.trust, `${path}/trust`));
  const secrets = validateRecordSlot(value.secrets, `${path}/secrets`);
  diagnostics.push(...secrets.diagnostics);
  diagnostics.push(...validateSelectionSecrets(secrets.record, `${path}/secrets`));
  const settings = validateRecordSlot(value.settings, `${path}/settings`);
  diagnostics.push(...settings.diagnostics);
  diagnostics.push(...validateSelectionSettings(settings.record, `${path}/settings`));
  return diagnostics;
};

// A selection list must not name the same (kind, name) twice: the second entry
// would silently shadow the first, so a repeated coordinate is rejected.
const duplicateSelectionDiagnostics = (
  selections: unknown,
  path: string,
): ConfigurationDiagnostic[] => {
  if (!Array.isArray(selections)) {
    return [];
  }
  const diagnostics: ConfigurationDiagnostic[] = [];
  const seen = new Set<string>();
  selections.forEach((selection, index) => {
    if (!isObjectRecord(selection)) {
      return;
    }
    const key = selectionCoordinate(selection.kind, selection.name);
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic("non-portable-value", "duplicate-coordinate", `${path}/${index}`),
      );
    }
    seen.add(key);
  });
  return diagnostics;
};

const trustMinimum = (value: Record<string, unknown>): string | undefined =>
  isObjectRecord(value.trust) && typeof value.trust.minimum === "string"
    ? value.trust.minimum
    : undefined;

// Base trust minimums keyed on (kind, name). An overlay may raise a trust
// requirement but must never weaken it, or an environment could silently accept
// a less-trusted release than the durable manifest demands.
const baseTrustByKey = (selections: unknown): Map<string, string> => {
  const byKey = new Map<string, string>();
  if (!Array.isArray(selections)) {
    return byKey;
  }
  for (const selection of selections) {
    if (!isObjectRecord(selection)) {
      continue;
    }
    const minimum = trustMinimum(selection);
    if (minimum !== undefined) {
      byKey.set(selectionCoordinate(selection.kind, selection.name), minimum);
    }
  }
  return byKey;
};

const validateEnvironments = (
  value: unknown,
  path: string,
  baseSelections: unknown,
): ConfigurationDiagnostic[] => {
  if (value === undefined) {
    return [];
  }
  if (!isObjectRecord(value)) {
    return [diagnostic("non-portable-value", "expected-object", path)];
  }
  const baseTrust = baseTrustByKey(baseSelections);
  const diagnostics: ConfigurationDiagnostic[] = [];
  for (const [name, overlay] of Object.entries(value)) {
    const at = `${path}/${name}`;
    if (!isObjectRecord(overlay)) {
      diagnostics.push(diagnostic("non-portable-value", "expected-object", at));
      continue;
    }
    // An overlay affects selection only; per-selection secrets/settings ride on
    // the selections themselves, so any other key is rejected as unknown.
    diagnostics.push(...unexpectedFieldDiagnostics(overlay, ["selections"], at));
    if (overlay.selections !== undefined && !Array.isArray(overlay.selections)) {
      diagnostics.push(diagnostic("non-portable-value", "expected-array", `${at}/selections`));
    }
    if (Array.isArray(overlay.selections)) {
      diagnostics.push(...duplicateSelectionDiagnostics(overlay.selections, `${at}/selections`));
      overlay.selections.forEach((selection, index) => {
        const selectionPath = `${at}/selections/${index}`;
        diagnostics.push(...validateSelection(selection, selectionPath));
        if (!isObjectRecord(selection)) {
          return;
        }
        const baseMinimum = baseTrust.get(selectionCoordinate(selection.kind, selection.name));
        const overlayMinimum = trustMinimum(selection);
        if (
          baseMinimum !== undefined &&
          overlayMinimum !== undefined &&
          isTrustLevel(baseMinimum) &&
          isTrustLevel(overlayMinimum) &&
          !meetsTrust(overlayMinimum, baseMinimum)
        ) {
          diagnostics.push(
            diagnostic("unverified-integrity", "trust-minimum-weakened", `${selectionPath}/trust`),
          );
        }
      });
    }
  }
  return diagnostics;
};

/**
 * Validate untrusted input into a closed, portable Manifest or diagnostics.
 * Takes a hostile-safe portable snapshot first, then validates that plain clone.
 */
export const validateManifest = (input: unknown): ConfigurationResult<Manifest> => {
  const snap = captureConfigurationData(input, "");
  if (!snap.ok) {
    return { ok: false, diagnostics: snap.diagnostics };
  }
  const value = snap.value;
  if (!isObjectRecord(value)) {
    return {
      ok: false,
      diagnostics: [diagnostic("non-portable-value", "expected-object", "")],
    };
  }

  const diagnostics: ConfigurationDiagnostic[] = unexpectedFieldDiagnostics(
    value,
    ["schemaVersion", "intent", "selections", "environments"],
    "",
  );

  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic("unsupported-version", "unsupported-schema-version", "/schemaVersion"),
    );
  }
  diagnostics.push(...validateIntent(value.intent, "/intent"));

  if (!Array.isArray(value.selections) || value.selections.length === 0) {
    diagnostics.push(diagnostic("non-portable-value", "expected-non-empty-array", "/selections"));
  } else {
    value.selections.forEach((selection, index) =>
      diagnostics.push(...validateSelection(selection, `/selections/${index}`)),
    );
    diagnostics.push(...duplicateSelectionDiagnostics(value.selections, "/selections"));
  }
  diagnostics.push(...validateEnvironments(value.environments, "/environments", value.selections));

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const manifest: Manifest = {
    schemaVersion: value.schemaVersion as unknown as Manifest["schemaVersion"],
    intent: value.intent as unknown as ConfigurationIntent,
    selections: (value.selections as unknown as Selection[]).map((selection) => selection),
    ...(value.environments === undefined
      ? {}
      : { environments: value.environments as unknown as Record<string, EnvironmentOverlay> }),
  };
  return { ok: true, value: freezeConfigurationData(manifest) };
};
