// Layer 3 resolution: choose exact versions from a catalog snapshot and bind
// each to its complete executable-closure identity. Resolution reads metadata
// only and never loads or executes integration code (ADR-003, ADR-007). Given
// the same manifest, catalog and generator it is deterministic.
//
// The catalog is untrusted at runtime, so it is reduced to a hostile-safe
// portable snapshot before use — no accessor on the caller's object runs during
// resolution. Composition is conditional over MaybePromise: when the resolver
// port is synchronous the whole call returns synchronously; it only becomes
// async when a port actually returns a thenable.

import type {
  Catalog,
  CatalogAdmission,
  ConfigurationResult,
  ConfigurationDiagnostic,
  ConfigurationDiagnosticReasonCode,
  GeneratorIdentity,
  Manifest,
  MaybePromise,
  ResolutionDependencies,
  ResolutionDecision,
  ResolvedConfiguration,
  ResolvedSelection,
  SelectionResolutionQuery,
  SelectionResolver,
  Selection,
} from "./contract.js";
import { isDigest } from "@geekist/llm-core/contracts";
import { maybeAll, maybeThen } from "@wpkernel/pipeline";
import { contentDigest, digestsEqual } from "./content-digest.js";
import {
  captureConfigurationData,
  diagnostic,
  freezeConfigurationData,
  isObjectRecord,
  unexpectedFieldDiagnostics,
} from "./diagnostics.js";
import { rangeMatcher } from "./version-range.js";
import {
  matchingSelectionCandidates,
  meetsTrust,
  orderedSelectionCandidates,
  selectionCoordinate,
  toResolvedSelection,
} from "./selection.js";
import { validateCatalogStructure } from "./catalog.js";
import {
  ambiguousSelectionDiagnostic,
  validateCatalogBinding,
  validateResolvedSelection,
} from "./resolution-integrity.js";
import { validateManifest } from "./manifest.js";

/** Default metadata-only resolver: deterministic highest-satisfying version. */
export const defaultResolver: SelectionResolver = {
  resolve: (query: SelectionResolutionQuery): ResolvedSelection | null => {
    const best = orderedSelectionCandidates(query.selection, query.catalog)[0];
    return best === undefined ? null : toResolvedSelection(best.entry);
  },
};

interface SelectionOutcome {
  readonly selection?: ResolvedSelection;
  readonly decision?: ResolutionDecision;
  readonly diagnostics: readonly ConfigurationDiagnostic[];
}

interface SelectionResolution {
  readonly selection: Selection;
  readonly catalog: Catalog;
  readonly resolver: SelectionResolver;
  readonly index: number;
  readonly custom: boolean;
}

const resolutionDecision = (
  selection: Selection,
  catalog: Catalog,
  resolved: ResolvedSelection,
): ResolutionDecision => {
  const eligibleVersions = orderedSelectionCandidates(selection, catalog).map(
    ({ entry }) => entry.version,
  );
  const highestSelected = eligibleVersions[0] === resolved.version;
  return {
    kind: "selection-resolution",
    selectionKind: selection.kind,
    name: selection.name,
    selectionReasonCode: "manifest-selection",
    versionReasonCode: highestSelected
      ? selection.trust === undefined
        ? "highest-compatible-release"
        : "highest-compatible-trusted-release"
      : "compatible-release-selected",
    requestedVersionRange: selection.versionRange,
    ...(selection.trust === undefined ? {} : { minimumTrust: selection.trust.minimum }),
    eligibleVersions,
    selectedVersion: resolved.version,
    selectedTrust: resolved.trust,
    artifactDigest: resolved.artifactDigest,
    closureDigest: resolved.closureDigest,
  };
};

const trustRejectedAllCandidates = (selection: Selection, catalog: Catalog): boolean => {
  if (selection.trust === undefined) {
    return false;
  }
  const minimumTrust = selection.trust.minimum;
  const candidates = matchingSelectionCandidates(selection, catalog);
  return (
    candidates.length > 0 && candidates.every(({ entry }) => !meetsTrust(entry.trust, minimumTrust))
  );
};

const resolveSelection = ({
  selection,
  catalog,
  resolver,
  index,
  custom,
}: SelectionResolution): MaybePromise<SelectionOutcome> => {
  const path = `/selections/${index}`;
  if (rangeMatcher(selection.versionRange).kind === "unsupported") {
    return {
      diagnostics: [
        diagnostic("unsupported-version", "unsupported-version-range", `${path}/versionRange`),
      ],
    };
  }
  const ambiguity = ambiguousSelectionDiagnostic(selection, catalog, path);
  if (ambiguity) {
    return { diagnostics: [ambiguity] };
  }
  return maybeThen(resolver.resolve({ selection, catalog }), (resolved): SelectionOutcome => {
    if (resolved === null) {
      const minimumTrust = selection.trust?.minimum;
      if (minimumTrust !== undefined && trustRejectedAllCandidates(selection, catalog)) {
        return {
          diagnostics: [diagnostic("unverified-integrity", "no-trusted-release", path)],
        };
      }
      return {
        diagnostics: [diagnostic("unresolved-selection", "no-matching-release", path)],
      };
    }
    // A custom resolver is untrusted: snapshot its output BEFORE reading any
    // field, so a hostile accessor cannot run during validation. The default
    // resolver derives from the already-snapshotted catalog and is safe.
    let safe = resolved;
    if (custom) {
      const snap = captureConfigurationData(resolved, path);
      if (!snap.ok) {
        return { diagnostics: snap.diagnostics };
      }
      safe = snap.value as unknown as ResolvedSelection;
    }
    const diagnostics = validateResolvedSelection(safe, selection, path);
    // Correspondence recomputes closure/evidence digests, so it only runs once
    // the shape checks in validateResolved confirm those fields are present.
    if (custom && diagnostics.length === 0) {
      diagnostics.push(...validateCatalogBinding(safe, catalog, path));
    }
    if (diagnostics.length > 0) {
      return { diagnostics };
    }
    return {
      selection: safe,
      decision: resolutionDecision(selection, catalog, safe),
      diagnostics: [],
    };
  });
};

interface Finalization {
  readonly outcomes: readonly SelectionOutcome[];
  readonly manifest: Manifest;
  readonly catalog: Catalog;
  readonly generator: GeneratorIdentity;
}

const finalize = ({
  outcomes,
  manifest,
  catalog,
  generator,
}: Finalization): ConfigurationResult<ResolvedConfiguration> => {
  const diagnostics: ConfigurationDiagnostic[] = [];
  const selections: ResolvedSelection[] = [];
  const resolutionDecisions: ResolutionDecision[] = [];
  for (const outcome of outcomes) {
    diagnostics.push(...outcome.diagnostics);
    if (outcome.selection) {
      selections.push(outcome.selection);
    }
    if (outcome.decision) {
      resolutionDecisions.push(outcome.decision);
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    value: freezeConfigurationData({
      manifestVersion: manifest.schemaVersion,
      manifestDigest: contentDigest(manifest),
      catalog: catalog.identity,
      catalogSequence: catalog.sequence,
      catalogSnapshotDigest: catalog.snapshotDigest,
      catalogAuthority: catalog.authority,
      generator,
      selections,
      resolutionDecisions,
    }),
  };
};

type OverlayOutcome =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly diagnostic: ConfigurationDiagnostic };

/**
 * Apply a named environment overlay deterministically: overlay selections
 * replace base selections keyed on (kind, name) in place, and any new keys are
 * appended. Per-selection secrets/settings ride on the selections themselves,
 * so nothing is merged then silently dropped.
 */
const applyEnvironment = (manifest: Manifest, environment: string | undefined): OverlayOutcome => {
  if (environment === undefined) {
    return { ok: true, manifest };
  }
  const overlay = manifest.environments?.[environment];
  if (overlay === undefined) {
    return {
      ok: false,
      diagnostic: diagnostic(
        "unknown-field",
        "unknown-environment",
        `/environments/${environment}`,
      ),
    };
  }
  const overlaySelections = overlay.selections ?? [];
  const overlayByKey = new Map(
    overlaySelections.map((selection) => [
      selectionCoordinate(selection.kind, selection.name),
      selection,
    ]),
  );
  const baseKeys = new Set(
    manifest.selections.map((selection) => selectionCoordinate(selection.kind, selection.name)),
  );
  const merged = manifest.selections.map((base) => {
    const over = overlayByKey.get(selectionCoordinate(base.kind, base.name));
    if (over === undefined) {
      return base;
    }
    // Overlay wins per key, but per-selection secrets/settings MERGE (base +
    // overlay) so an overlay that touches one setting cannot silently drop the
    // rest of the base selection's configuration.
    return {
      ...base,
      ...over,
      secrets: { ...base.secrets, ...over.secrets },
      settings: { ...base.settings, ...over.settings },
    };
  });
  for (const selection of overlaySelections) {
    if (!baseKeys.has(selectionCoordinate(selection.kind, selection.name))) {
      merged.push(selection);
    }
  }
  return { ok: true, manifest: { ...manifest, selections: merged } };
};

// The generator identity is a sealed structure: exactly { id, version,
// artifactDigest }. A missing field, malformed digest or ambient extra key is
// rejected before it is bound into a resolution.
const validateGenerator = (generator: GeneratorIdentity): ConfigurationDiagnostic[] => {
  const value = generator as unknown as Record<string, unknown>;
  if (!isObjectRecord(value)) {
    return [diagnostic("unknown-field", "expected-object", "/generator")];
  }
  const diagnostics = unexpectedFieldDiagnostics(
    value,
    ["id", "version", "artifactDigest"],
    "/generator",
  );
  const bad = (reasonCode: ConfigurationDiagnosticReasonCode, path: string): void => {
    diagnostics.push(diagnostic("unverified-integrity", reasonCode, path));
  };
  if (typeof value.id !== "string") {
    bad("expected-string", "/generator/id");
  }
  if (typeof value.version !== "string") {
    bad("expected-string", "/generator/version");
  }
  if (!isDigest(value.artifactDigest)) {
    bad("expected-digest", "/generator/artifactDigest");
  }
  return diagnostics;
};

/** Recompute the catalog snapshot digest and compare it to the declared value. */
const snapshotDigestMatches = (catalog: Catalog): boolean => {
  const recomputed = contentDigest({
    identity: catalog.identity,
    sequence: catalog.sequence,
    authority: catalog.authority,
    entries: catalog.entries,
  });
  return digestsEqual(recomputed, catalog.snapshotDigest);
};

const validateCatalogAdmission = (
  admission: CatalogAdmission,
  catalog: Catalog,
): ConfigurationDiagnostic[] => {
  const value = admission as unknown as Record<string, unknown>;
  if (!isObjectRecord(value)) {
    return [diagnostic("unverified-integrity", "expected-object", "/catalogAdmission")];
  }
  const diagnostics = unexpectedFieldDiagnostics(
    value,
    ["catalog", "snapshotDigest", "minimumSequence"],
    "/catalogAdmission",
  );
  const identity = value.catalog;
  if (
    !isObjectRecord(identity) ||
    typeof identity.id !== "string" ||
    typeof identity.version !== "string"
  ) {
    diagnostics.push(
      diagnostic("unverified-integrity", "expected-object", "/catalogAdmission/catalog"),
    );
  } else {
    diagnostics.push(
      ...unexpectedFieldDiagnostics(identity, ["id", "version"], "/catalogAdmission/catalog"),
    );
    if (identity.id !== catalog.identity.id || identity.version !== catalog.identity.version) {
      diagnostics.push(
        diagnostic(
          "unverified-integrity",
          "catalog-identity-not-approved",
          "/catalogAdmission/catalog",
        ),
      );
    }
  }
  if (!isDigest(value.snapshotDigest)) {
    diagnostics.push(
      diagnostic("unverified-integrity", "expected-digest", "/catalogAdmission/snapshotDigest"),
    );
  } else if (!digestsEqual(value.snapshotDigest, catalog.snapshotDigest)) {
    diagnostics.push(
      diagnostic(
        "unverified-integrity",
        "catalog-snapshot-not-approved",
        "/catalogAdmission/snapshotDigest",
      ),
    );
  }
  if (
    typeof value.minimumSequence !== "number" ||
    !Number.isSafeInteger(value.minimumSequence) ||
    value.minimumSequence < 0
  ) {
    diagnostics.push(
      diagnostic(
        "unverified-integrity",
        "expected-non-negative-safe-integer",
        "/catalogAdmission/minimumSequence",
      ),
    );
  } else if (catalog.sequence < value.minimumSequence) {
    diagnostics.push(
      diagnostic("unverified-integrity", "catalog-replay-policy-violated", "/catalog/sequence"),
    );
  }
  return diagnostics;
};

/** Resolve every selection deterministically against one catalog snapshot. */
export const resolveManifest = (
  manifest: Manifest,
  catalog: Catalog,
  dependencies: ResolutionDependencies,
): MaybePromise<ConfigurationResult<ResolvedConfiguration>> => {
  const checkedManifest = validateManifest(manifest);
  if (!checkedManifest.ok) {
    return checkedManifest;
  }
  const overlaid = applyEnvironment(checkedManifest.value, dependencies.environment);
  if (!overlaid.ok) {
    return { ok: false, diagnostics: [overlaid.diagnostic] };
  }
  const effectiveManifest = freezeConfigurationData(structuredClone(overlaid.manifest));

  // Snapshot the generator BEFORE reading any field, so a hostile accessor
  // cannot run and the accepted identity is a fresh clone we own (freezing it
  // never freezes the caller's object).
  const genSnap = captureConfigurationData(dependencies.generator, "/generator");
  if (!genSnap.ok) {
    return { ok: false, diagnostics: genSnap.diagnostics };
  }
  const safeGenerator = genSnap.value as unknown as GeneratorIdentity;
  const generatorDiagnostics = validateGenerator(safeGenerator);
  if (generatorDiagnostics.length > 0) {
    return { ok: false, diagnostics: generatorDiagnostics };
  }

  const snap = captureConfigurationData(catalog, "/catalog");
  if (!snap.ok) {
    return { ok: false, diagnostics: snap.diagnostics };
  }
  const safeCatalog = snap.value as unknown as Catalog;
  const structural = validateCatalogStructure(safeCatalog);
  if (structural.length > 0) {
    return { ok: false, diagnostics: structural };
  }
  if (!snapshotDigestMatches(safeCatalog)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("unverified-integrity", "catalog-snapshot-mismatch", "/catalog/snapshotDigest"),
      ],
    };
  }
  const admissionSnap = captureConfigurationData(
    dependencies.catalogAdmission,
    "/catalogAdmission",
  );
  if (!admissionSnap.ok) {
    return { ok: false, diagnostics: admissionSnap.diagnostics };
  }
  const admissionDiagnostics = validateCatalogAdmission(
    admissionSnap.value as unknown as CatalogAdmission,
    safeCatalog,
  );
  if (admissionDiagnostics.length > 0) {
    return { ok: false, diagnostics: admissionDiagnostics };
  }
  // The verified snapshot is the sole catalogue authority for this resolution.
  // A custom resolver is untrusted, so freeze the owned snapshot before it
  // crosses that boundary. This prevents it from changing catalogue metadata
  // to make a forged result appear to correspond to a different authority.
  freezeConfigurationData(safeCatalog);
  const resolver = dependencies.resolver ?? defaultResolver;
  const resolverIsCustom = dependencies.resolver !== undefined;

  const outcomes = effectiveManifest.selections.map((selection, index) =>
    resolveSelection({
      selection,
      catalog: safeCatalog,
      resolver,
      index,
      custom: resolverIsCustom,
    }),
  );
  return maybeThen(maybeAll(outcomes), (resolved) =>
    finalize({
      outcomes: resolved,
      manifest: effectiveManifest,
      catalog: safeCatalog,
      generator: safeGenerator,
    }),
  );
};
