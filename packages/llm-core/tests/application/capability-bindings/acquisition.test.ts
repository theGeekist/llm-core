import { describe, expect, test } from "bun:test";
import type { CapabilityBinding } from "#contracts";
import {
  acquireCapabilityBindings,
  registerCapabilityAcquisitionFactory,
  registerCapabilityCandidate,
  resolveCapabilityCandidates,
  type CapabilityAcquisitionFactory,
  type CapabilityPortMap,
  type RuntimeCapabilityBinding,
} from "../../../src/application/capability-bindings/public";
import {
  candidateDependencies,
  candidateDescriptor,
  passingClaim,
} from "./capability-binding-fixtures";

const retrieverPort = () => ({ retrieve: () => ({ documents: [] }) });
const cachePort = () => ({ get: () => null, set: () => true, delete: () => true });

describe("candidate planning and post-acceptance acquisition", () => {
  test("keeps descriptors and runtime bindings free of generic native escape slots", () => {
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

  test("plans entirely from frozen inert descriptors before invoking exact factories", () => {
    let evidenceChecks = 0;
    let acquisitions = 0;
    const acquire = () => {
      acquisitions += 1;
      return { port: retrieverPort() };
    };
    const candidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "langchain:retriever"),
      candidateDependencies(
        (proof) => {
          evidenceChecks += 1;
          expect(Object.isFrozen(proof)).toBe(true);
          expect("implementationToken" in proof).toBe(false);
          return true;
        },
        (proof) => proof.acquire === acquire,
      ),
    );
    expect(JSON.stringify(candidate)).toContain("langchain:retriever");
    expect(JSON.stringify(candidate)).not.toContain("acquire");
    expect(Object.isFrozen(candidate)).toBe(true);

    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever", bindingId: "langchain:retriever" }],
      candidates: [candidate],
    });
    const factory = registerCapabilityAcquisitionFactory(candidate, {
      kind: "retriever",
      bindingId: "langchain:retriever",
      acquire,
    });

    expect(() =>
      registerCapabilityAcquisitionFactory(candidate, {
        kind: "retriever",
        bindingId: "langchain:retriever",
        acquire: () => ({ port: retrieverPort() }),
      }),
    ).toThrow("identity verification failed");

    expect(evidenceChecks).toBe(1);
    expect(acquisitions).toBe(0);
    const acquired = acquireCapabilityBindings(plan, [factory]);
    expect(acquired).not.toBeInstanceOf(Promise);
    expect(acquisitions).toBe(1);
    expect((acquired as Awaited<typeof acquired>).bindings[0]?.descriptor.bindingId).toBe(
      "langchain:retriever",
    );
  });

  test("rejects unsupported, forged and factory-mismatched plans before acquisition", () => {
    const unsupportedSource = candidateDescriptor("retriever", "unqualified:retriever");
    unsupportedSource.descriptor.claims = [
      {
        ...passingClaim("llm-core.retrieval.retrieve", "unqualified:retriever"),
        status: "unsupported",
        evidence: {
          ...passingClaim("llm-core.retrieval.retrieve", "unqualified:retriever").evidence,
          result: "fail",
          failures: [{ name: "qualification", value: "absent" }],
        },
      },
    ];
    expect(() => registerCapabilityCandidate(unsupportedSource, candidateDependencies())).toThrow(
      "does not prove",
    );

    let acquisitions = 0;
    const rawFactory = (bindingId: string): CapabilityAcquisitionFactory<"retriever"> => ({
      kind: "retriever",
      bindingId,
      acquire: () => {
        acquisitions += 1;
        return { port: retrieverPort() };
      },
    });
    const selectedRaw = rawFactory("qualified:retriever");
    const wrongCandidateRaw = rawFactory("qualified:retriever");
    const extraRaw = rawFactory("qualified:extra");
    const candidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(
        () => true,
        (proof) => proof.acquire === selectedRaw.acquire,
      ),
    );
    const sameStringCandidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(
        () => true,
        (proof) => proof.acquire === wrongCandidateRaw.acquire,
      ),
    );
    const extraCandidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:extra"),
      candidateDependencies(
        () => true,
        (proof) => proof.acquire === extraRaw.acquire,
      ),
    );
    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever" }],
      candidates: [candidate],
    });
    const selected = registerCapabilityAcquisitionFactory(candidate, selectedRaw);
    const wrongCandidate = registerCapabilityAcquisitionFactory(
      sameStringCandidate,
      wrongCandidateRaw,
    );
    const extra = registerCapabilityAcquisitionFactory(extraCandidate, extraRaw);

    expect(() => acquireCapabilityBindings({ ...plan } as never, [selected])).toThrow(
      "authentic accepted",
    );
    expect(() => acquireCapabilityBindings(plan, [])).toThrow("exactly match");
    expect(() => acquireCapabilityBindings(plan, [wrongCandidate])).toThrow("exactly match");
    expect(() => acquireCapabilityBindings(plan, [selected, extra])).toThrow("exactly match");
    expect(() =>
      acquireCapabilityBindings(plan, [rawFactory("qualified:retriever") as never]),
    ).toThrow("authentic registered");
    expect(() =>
      acquireCapabilityBindings(plan, [
        { ...rawFactory("qualified:retriever"), kind: "unknown-port" } as never,
      ]),
    ).toThrow("authentic registered");
    expect(() => acquireCapabilityBindings(plan, [selected, selected])).toThrow(
      "duplicate identity",
    );
    expect(acquisitions).toBe(0);
  });

  test("rejects acquired release accessors without invoking them", () => {
    const candidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(),
    );
    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever" }],
      candidates: [candidate],
    });
    let accessorCalls = 0;
    const acquiredPort = Object.defineProperty({ port: retrieverPort() }, "release", {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        return () => undefined;
      },
    });

    expect(() =>
      acquireCapabilityBindings(plan, [
        registerCapabilityAcquisitionFactory(candidate, {
          kind: "retriever",
          bindingId: "qualified:retriever",
          acquire: () => acquiredPort as never,
        }),
      ]),
    ).toThrow("optional release function");
    expect(accessorCalls).toBe(0);
  });

  test("rolls back acquired resources in reverse order when a later factory fails", async () => {
    const retriever = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(),
    );
    const cache = registerCapabilityCandidate(
      candidateDescriptor("cache-store", "qualified:cache"),
      candidateDependencies(),
    );
    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever" }, { kind: "cache-store" }],
      candidates: [retriever, cache],
    });
    const events: string[] = [];
    const cacheFactory: CapabilityAcquisitionFactory<"cache-store"> = {
      kind: "cache-store",
      bindingId: "qualified:cache",
      acquire: () => {
        events.push("acquire-cache");
        return {
          port: cachePort(),
          release: () => {
            events.push("release-cache");
          },
        };
      },
    };
    const retrieverFactory: CapabilityAcquisitionFactory<"retriever"> = {
      kind: "retriever",
      bindingId: "qualified:retriever",
      acquire: () => {
        events.push("acquire-retriever");
        return Promise.reject(new Error("native acquisition failed"));
      },
    };
    const factories = [
      registerCapabilityAcquisitionFactory(cache, cacheFactory),
      registerCapabilityAcquisitionFactory(retriever, retrieverFactory),
    ] as const;

    await expect(acquireCapabilityBindings(plan, factories)).rejects.toThrow(
      "native acquisition failed",
    );
    expect(events).toEqual(["acquire-cache", "acquire-retriever", "release-cache"]);
  });

  test("returns a one-shot reverse-order release boundary", async () => {
    const retriever = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(),
    );
    const cache = registerCapabilityCandidate(
      candidateDescriptor("cache-store", "qualified:cache"),
      candidateDependencies(),
    );
    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever" }, { kind: "cache-store" }],
      candidates: [retriever, cache],
    });
    const releases: string[] = [];
    const cacheFactory: CapabilityAcquisitionFactory<"cache-store"> = {
      kind: "cache-store",
      bindingId: "qualified:cache",
      acquire: () => ({
        port: cachePort(),
        release: () => {
          releases.push("cache");
        },
      }),
    };
    const retrieverFactory: CapabilityAcquisitionFactory<"retriever"> = {
      kind: "retriever",
      bindingId: "qualified:retriever",
      acquire: () => ({
        port: retrieverPort(),
        release: () => {
          releases.push("retriever");
        },
      }),
    };
    const acquired = await acquireCapabilityBindings(plan, [
      registerCapabilityAcquisitionFactory(cache, cacheFactory),
      registerCapabilityAcquisitionFactory(retriever, retrieverFactory),
    ]);

    await acquired.release();
    await acquired.release();
    expect(releases).toEqual(["retriever", "cache"]);
  });

  test("preserves a release failure even when the thrown value is undefined", () => {
    const candidate = registerCapabilityCandidate(
      candidateDescriptor("retriever", "qualified:retriever"),
      candidateDependencies(),
    );
    const plan = resolveCapabilityCandidates({
      requirements: [{ kind: "retriever" }],
      candidates: [candidate],
    });
    const acquired = acquireCapabilityBindings(plan, [
      registerCapabilityAcquisitionFactory(candidate, {
        kind: "retriever",
        bindingId: "qualified:retriever",
        acquire: () => ({
          port: retrieverPort(),
          release: () => {
            throw undefined;
          },
        }),
      }),
    ]) as Exclude<ReturnType<typeof acquireCapabilityBindings>, PromiseLike<unknown>>;
    let failed = false;
    try {
      acquired.release();
    } catch (error) {
      failed = true;
      expect(error).toBeUndefined();
    }
    expect(failed).toBe(true);
  });
});
