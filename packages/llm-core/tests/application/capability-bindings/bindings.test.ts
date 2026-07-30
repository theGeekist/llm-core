import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  nativeExtensions,
  type CapabilityBinding,
  type CapabilityClaim,
} from "#contracts";
import {
  capabilityIdForPort,
  registerRuntimeCapabilityBinding,
  resolveCapabilityBindings,
  type CapabilityPortMap,
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
  test("clones descriptors and binds an immutable callable facade without freezing the source", () => {
    const source = runtimeBinding("retriever", "retriever:a", retriever);
    const registered = registerRuntimeCapabilityBinding(source, verificationDependencies());
    source.descriptor.claims[0]!.version = contractVersion("2.0.0");
    retriever.retrieve = () => ({ documents: [], citations: [] });

    expect(registered.descriptor.claims[0]?.version).toBe(contractVersion("1.0.0"));
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.descriptor)).toBe(true);
    expect(Object.isFrozen(retriever)).toBe(false);
    expect(Object.isFrozen(registered.port)).toBe(true);
    expect(
      registered.port.retrieve({
        request: { query: { content: [] } },
        context: {} as never,
      }),
    ).toEqual({
      documents: [],
    });
  });

  test("verifies frozen, implementation-bound conformance evidence", () => {
    let verified = 0;
    let attestedToken: object | undefined;
    const registered = registerRuntimeCapabilityBinding(
      runtimeBinding("retriever", "retriever:a", retriever),
      verificationDependencies((input) => {
        verified += 1;
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.evidence)).toBe(true);
        expect(input.bindingId).toBe(input.evidence.implementationId);
        expect(input.kind).toBe("retriever");
        attestedToken = input.implementationToken;
        return true;
      }),
    );

    expect(registered.kind).toBe("retriever");
    expect(attestedToken).toBe(registered.port);
    expect(verified).toBe(1);
  });

  test("rejects accessor substitution at binding, method and nested descriptor boundaries", () => {
    const source = runtimeBinding("retriever", "retriever:accessor", retriever);
    let portReads = 0;
    const outer = {
      kind: source.kind,
      descriptor: source.descriptor,
      get port() {
        portReads += 1;
        return portReads === 1 ? retriever : { retrieve: () => ({ documents: [{ id: "b" }] }) };
      },
    };
    expect(() =>
      registerRuntimeCapabilityBinding(outer as never, verificationDependencies()),
    ).toThrow(TypeError);
    expect(portReads).toBe(0);

    const methodAccessor = Object.defineProperty({}, "retrieve", {
      enumerable: true,
      get: () => retriever.retrieve,
    });
    expect(() =>
      registerRuntimeCapabilityBinding(
        runtimeBinding("retriever", "retriever:method-accessor", methodAccessor as never),
        verificationDependencies(),
      ),
    ).toThrow(TypeError);

    const nestedAccessor = runtimeBinding("retriever", "retriever:nested-accessor", retriever);
    nestedAccessor.descriptor.extensions = {
      "dev.llm-core.test": Object.defineProperty({}, "mode", {
        enumerable: true,
        get: () => "safe",
      }) as never,
    };
    expect(() =>
      registerRuntimeCapabilityBinding(nestedAccessor, verificationDependencies()),
    ).toThrow(TypeError);
  });

  test("normalizes nested proxy, symbol and cycle descriptor failures", () => {
    const expected = "Capability descriptors must be closed, portable and implementation-bound.";

    const proxied = runtimeBinding("retriever", "retriever:proxy-extension", retriever);
    proxied.descriptor.extensions = {
      "dev.llm-core.test": new Proxy({ mode: "safe" }, {}),
    };

    const symbolBearing = runtimeBinding("retriever", "retriever:symbol-extension", retriever);
    symbolBearing.descriptor.extensions = {
      "dev.llm-core.test": { value: Symbol("native") },
    } as never;

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const cyclic = runtimeBinding("retriever", "retriever:cycle-extension", retriever);
    cyclic.descriptor.extensions = {
      "dev.llm-core.test": cycle,
    } as never;

    for (const source of [proxied, symbolBearing, cyclic]) {
      expect(() => registerRuntimeCapabilityBinding(source, verificationDependencies())).toThrow(
        expected,
      );
    }
  });

  test("binds kind and implementation identity and prevents callable drift", () => {
    const modelLike = { generate: () => ({ content: [] }) };
    expect(() =>
      registerRuntimeCapabilityBinding(
        runtimeBinding("image-generation", "image:wrong", modelLike as never),
        verificationDependencies((proof) => proof.kind === "model"),
      ),
    ).toThrow("verification failed");

    const source = runtimeBinding("image-generation", "image:fixed", modelLike as never);
    const registered = registerRuntimeCapabilityBinding(source, verificationDependencies());
    modelLike.generate = () => {
      throw new Error("mutated");
    };
    expect(
      registered.port.generate({ request: {} as never, context: {} as never }) as unknown,
    ).toEqual({
      content: [],
    });
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
    expect(registered.port.stream).not.toBe(queryEngine.stream);
  });

  test("rejects contradictory additional evidence", () => {
    const claim = passingClaim(capabilityIdForPort("retriever"), "retriever:contradictory");
    const failed = structuredClone(claim.evidence) as unknown as Record<string, unknown>;
    failed.result = "fail";
    failed.failures = [{ name: "behavior", value: "failed" }];
    claim.additionalEvidence = [failed as never];
    expect(() =>
      registerRuntimeCapabilityBinding(
        {
          kind: "retriever",
          descriptor: { bindingId: "retriever:contradictory", claims: [claim] },
          port: retriever,
        },
        verificationDependencies(),
      ),
    ).toThrow();
  });

  test("preserves safe extensions and rejects unsafe extension data", () => {
    const source = runtimeBinding("retriever", "retriever:extensions", retriever);
    source.descriptor.extensions = nativeExtensions({ "dev.llm-core.test": { mode: "safe" } });
    source.descriptor.claims[0]!.extensions = nativeExtensions({
      "dev.llm-core.claim": { tier: 1 },
    });
    source.descriptor.claims[0]!.evidence.extensions = nativeExtensions({
      "dev.llm-core.evidence": true,
    });
    const registered = registerRuntimeCapabilityBinding(source, verificationDependencies());
    expect(registered.descriptor.extensions).toEqual({
      "dev.llm-core.test": { mode: "safe" },
    });
    expect(Object.isFrozen(registered.descriptor.extensions)).toBe(true);

    const unsafe = runtimeBinding("retriever", "retriever:unsafe-extension", retriever);
    unsafe.descriptor.extensions = {
      "dev.llm-core.test": { apiKey: "sk-raw-placeholder" },
    };
    expect(() => registerRuntimeCapabilityBinding(unsafe, verificationDependencies())).toThrow();
  });

  test("does not expose generic construct, factory, provider or native slots", () => {
    type DescriptorKeys = keyof CapabilityBinding;
    type HasConstructs = "constructs" extends DescriptorKeys ? true : false;
    type HasFactory = "factory" extends DescriptorKeys ? true : false;
    type HasProvider = "provider" extends keyof RuntimeCapabilityBinding<"retriever">
      ? true
      : false;
    type HasNative = "native" extends keyof RuntimeCapabilityBinding<"retriever"> ? true : false;
    type HasToolingPorts =
      | "action-digest"
      | "tool-schema-digest"
      | "tool-argument-validation" extends keyof CapabilityPortMap
      ? true
      : false;

    const proof: [HasConstructs, HasFactory, HasProvider, HasNative, HasToolingPorts] = [
      false,
      false,
      false,
      false,
      true,
    ];
    expect(proof).toEqual([false, false, false, false, true]);
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

  test("fails closed on wildcard multi-version claims independent of descriptor order", () => {
    const capabilityId = "llm-core.retrieval.region";
    const claims = [
      passingClaim(capabilityId, "retriever:versions", contractVersion("1.0.0")),
      passingClaim(capabilityId, "retriever:versions", contractVersion("2.0.0")),
    ];
    for (const ordered of [claims, claims.toReversed()]) {
      const binding = registeredRetriever("retriever:versions", ordered);
      expect(
        resolveCapabilityBindings({
          requirements: [{ kind: "retriever", capabilities: [{ capabilityId }] }],
          bindings: [binding],
        }).kind,
      ).toBe("unresolved");
      expect(
        resolveCapabilityBindings({
          requirements: [
            {
              kind: "retriever",
              capabilities: [{ capabilityId, versionRange: "2.0.0" }],
            },
          ],
          bindings: [binding],
        }).kind,
      ).toBe("resolved");
    }
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
