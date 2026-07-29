import { describe, expect, test } from "bun:test";
import { contractVersion, type CapabilityBinding, type CapabilityClaim } from "#contracts";
import {
  capabilityIdForPort,
  registerRuntimeCapabilityBinding,
  resolveCapabilityBindings,
  type RuntimeCapabilityBinding,
} from "../../../src/application/capability-bindings/public";
import { createCapabilityBindingCatalog } from "../../../src/composition/capability-bindings/public";
import type { CacheStore } from "../../../src/features/storage/public";
import {
  conditionalClaim,
  passingClaim,
  runtimeBinding,
  verificationDependencies,
} from "./helpers";

const retriever = { retrieve: () => ({ documents: [] }) };
const cache: CacheStore = {
  get: () => null,
  set: () => true,
  delete: () => true,
};

describe("runtime capability binding registration", () => {
  test("clones and freezes portable descriptors without freezing live ports", () => {
    const source = runtimeBinding("retriever", "retriever:a", retriever);
    const registered = registerRuntimeCapabilityBinding(source, verificationDependencies());
    source.descriptor.claims[0]!.version = contractVersion("2.0.0");
    retriever.retrieve = () => ({ documents: [], citations: [] });

    expect(registered.descriptor.claims[0]?.version).toBe(contractVersion("1.0.0"));
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.descriptor)).toBe(true);
    expect(Object.isFrozen(registered.port)).toBe(false);
    expect(registered.port.retrieve({ query: { content: [] } }, {} as never)).toEqual({
      documents: [],
      citations: [],
    });
  });

  test("verifies frozen, implementation-bound conformance evidence", () => {
    let verified = 0;
    const registered = registerRuntimeCapabilityBinding(
      runtimeBinding("retriever", "retriever:a", retriever),
      verificationDependencies((input) => {
        verified += 1;
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.evidence)).toBe(true);
        expect(input.bindingId).toBe(input.evidence.implementationId);
        return true;
      }),
    );

    expect(registered.kind).toBe("retriever");
    expect(verified).toBe(1);
  });

  test("rejects forged, leaking and semantically mismatched descriptors", () => {
    const good = runtimeBinding("retriever", "retriever:a", retriever);
    expect(() =>
      registerRuntimeCapabilityBinding(
        {
          ...good,
          descriptor: { ...good.descriptor, native: { path: "/private/key" } },
        } as unknown as RuntimeCapabilityBinding<"retriever">,
        verificationDependencies(),
      ),
    ).toThrow();
    expect(() =>
      registerRuntimeCapabilityBinding(
        runtimeBinding("retriever", "/private/key", retriever),
        verificationDependencies(),
      ),
    ).toThrow();

    const mismatchedEvidence = {
      ...good,
      descriptor: structuredClone(good.descriptor),
    };
    (
      mismatchedEvidence.descriptor.claims[0]!.evidence as {
        implementationId: string;
      }
    ).implementationId = "retriever:other";
    expect(() =>
      registerRuntimeCapabilityBinding(mismatchedEvidence, verificationDependencies()),
    ).toThrow();

    const leakingEvidence = {
      ...good,
      descriptor: structuredClone(good.descriptor),
    };
    leakingEvidence.descriptor.claims[0]!.evidence.providerId = "sk-raw-placeholder";
    expect(() =>
      registerRuntimeCapabilityBinding(leakingEvidence, verificationDependencies()),
    ).toThrow();

    expect(() =>
      registerRuntimeCapabilityBinding(
        {
          kind: "cache-store",
          descriptor: good.descriptor,
          port: retriever,
        } as unknown as RuntimeCapabilityBinding<"cache-store">,
        verificationDependencies(),
      ),
    ).toThrow();
  });

  test("requires optional methods and their evidence to agree", () => {
    const queryEngine = {
      query: () => ({ content: [] }),
      stream: async function* () {
        yield { kind: "start" as const };
      },
    };
    expect(() =>
      registerRuntimeCapabilityBinding(
        runtimeBinding("query-engine", "query:a", queryEngine),
        verificationDependencies(),
      ),
    ).toThrow();

    const registered = registerRuntimeCapabilityBinding(
      runtimeBinding("query-engine", "query:a", queryEngine, [
        passingClaim("llm-core.retrieval.query.stream", "query:a"),
      ]),
      verificationDependencies(),
    );
    expect(registered.port.stream).toBe(queryEngine.stream);
  });

  test("does not expose generic construct, factory, provider or native slots", () => {
    type DescriptorKeys = keyof CapabilityBinding;
    type HasConstructs = "constructs" extends DescriptorKeys ? true : false;
    type HasFactory = "factory" extends DescriptorKeys ? true : false;
    type HasProvider = "provider" extends keyof RuntimeCapabilityBinding<"retriever">
      ? true
      : false;
    type HasNative = "native" extends keyof RuntimeCapabilityBinding<"retriever"> ? true : false;

    const proof: [HasConstructs, HasFactory, HasProvider, HasNative] = [false, false, false, false];
    expect(proof).toEqual([false, false, false, false]);
  });
});

describe("deterministic capability resolution", () => {
  const registeredRetriever = (id: string, claims: CapabilityClaim[] = []) =>
    registerRuntimeCapabilityBinding(
      runtimeBinding("retriever", id, retriever, claims),
      verificationDependencies(),
    );

  test("rejects missing, ambiguous, duplicate and forged inputs without partial plans", () => {
    const a = registeredRetriever("retriever:a");
    const b = registeredRetriever("retriever:b");
    const missing = resolveCapabilityBindings({
      requirements: [{ kind: "cache-store" }],
      bindings: [a],
    });
    const ambiguous = resolveCapabilityBindings({
      requirements: [{ kind: "retriever" }],
      bindings: [a, b],
    });
    const duplicate = resolveCapabilityBindings({
      requirements: [{ kind: "retriever" }, { kind: "retriever" }],
      bindings: [a],
    });
    const forged = resolveCapabilityBindings({
      requirements: [{ kind: "retriever" }],
      bindings: [runtimeBinding("retriever", "forged", retriever) as never],
    });

    expect(missing).toMatchObject({ kind: "unresolved" });
    expect(ambiguous).toMatchObject({ kind: "unresolved" });
    expect(duplicate).toMatchObject({ kind: "unresolved" });
    expect(forged).toMatchObject({ kind: "unresolved" });
    expect("bindings" in missing).toBe(false);
  });

  test("is registration-order independent and never selects the first binding", () => {
    const forward = createCapabilityBindingCatalog(verificationDependencies());
    forward.register(runtimeBinding("retriever", "retriever:b", retriever));
    forward.register(runtimeBinding("retriever", "retriever:a", retriever));
    const reverse = createCapabilityBindingCatalog(verificationDependencies());
    reverse.register(runtimeBinding("retriever", "retriever:a", retriever));
    reverse.register(runtimeBinding("retriever", "retriever:b", retriever));

    const left = forward.resolve({ requirements: [{ kind: "retriever" }] });
    const right = reverse.resolve({ requirements: [{ kind: "retriever" }] });
    expect(left).toEqual(right);
    expect(left.kind).toBe("unresolved");
  });

  test("honors exact and named-default selection without incompatible fallback", () => {
    const extraCapability = "llm-core.retrieval.filtered";
    const incompatible = registeredRetriever("retriever:exact");
    const compatible = registeredRetriever("retriever:other", [
      passingClaim(extraCapability, "retriever:other"),
    ]);
    const exact = resolveCapabilityBindings({
      requirements: [
        {
          kind: "retriever",
          bindingId: "retriever:exact",
          capabilities: [{ capabilityId: extraCapability }],
        },
      ],
      bindings: [incompatible, compatible],
    });
    const namedDefault = resolveCapabilityBindings({
      requirements: [{ kind: "retriever" }],
      defaults: { retriever: "retriever:other" },
      bindings: [incompatible, compatible],
    });

    expect(exact.kind).toBe("unresolved");
    expect(namedDefault).toMatchObject({
      kind: "resolved",
      bindings: [{ descriptor: { bindingId: "retriever:other" } }],
    });
  });

  test("requires trusted proof for conditional claims and constraints", () => {
    const capabilityId = "llm-core.retrieval.region";
    const conditional = registeredRetriever("retriever:conditional", [
      conditionalClaim(capabilityId, "retriever:conditional"),
    ]);
    const request = {
      requirements: [
        {
          kind: "retriever" as const,
          capabilities: [{ capabilityId, constraints: [{ name: "region", value: "local" }] }],
        },
      ],
      bindings: [conditional],
    };

    expect(resolveCapabilityBindings(request).kind).toBe("unresolved");
    expect(resolveCapabilityBindings(request, { evaluateCondition: () => true }).kind).toBe(
      "resolved",
    );
    expect(
      resolveCapabilityBindings(request, {
        evaluateCondition: () => {
          throw new Error("native detail");
        },
      }).kind,
    ).toBe("unresolved");
    expect(
      resolveCapabilityBindings(request, {
        evaluateCondition: () => "yes" as unknown as boolean,
      }).kind,
    ).toBe("unresolved");
  });

  test("does not resolve a conditional primary port claim without trusted proof", () => {
    const source = runtimeBinding("retriever", "retriever:primary-conditional", retriever);
    source.descriptor.claims = [
      conditionalClaim(capabilityIdForPort("retriever"), "retriever:primary-conditional"),
    ];
    const binding = registerRuntimeCapabilityBinding(source, verificationDependencies());
    const request = {
      requirements: [
        {
          kind: "retriever" as const,
          capabilities: [
            {
              capabilityId: capabilityIdForPort("retriever"),
              required: false,
            },
          ],
        },
      ],
      bindings: [binding],
    };

    expect(resolveCapabilityBindings(request).kind).toBe("unresolved");
    expect(resolveCapabilityBindings(request, { evaluateCondition: () => true }).kind).toBe(
      "resolved",
    );
  });

  test("resolves the complete typed plan atomically", () => {
    const retrieverBinding = registeredRetriever("retriever:a");
    const cacheBinding = registerRuntimeCapabilityBinding(
      runtimeBinding("cache-store", "cache:a", cache),
      verificationDependencies(),
    );
    const outcome = resolveCapabilityBindings({
      requirements: [{ kind: "cache-store" }, { kind: "retriever" }],
      bindings: [retrieverBinding, cacheBinding],
    });

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      expect(outcome.bindings.map((binding) => binding.kind)).toEqual(["cache-store", "retriever"]);
    }
  });

  test("reports unsupported ranges without including native or secret data", () => {
    const capabilityId = capabilityIdForPort("retriever");
    const outcome = resolveCapabilityBindings({
      requirements: [
        {
          kind: "retriever",
          capabilities: [{ capabilityId, versionRange: "^1.0.0" }],
        },
      ],
      bindings: [registeredRetriever("retriever:a")],
    });

    expect(outcome.kind).toBe("unresolved");
    expect(JSON.stringify(outcome)).not.toContain("native detail");
    expect(JSON.stringify(outcome)).not.toContain("/private/");
    expect(outcome.diagnostics.some((entry) => entry.code === "unsupported-version-range")).toBe(
      true,
    );
  });
});
