/* eslint-disable consistent-return -- MaybePromise release and rollback deliberately preserve synchronous and asynchronous paths. */
import { isExternalId } from "#contracts";
import { isPromiseLike, type MaybePromise } from "#shared/maybe";
import { isSensitivePortableString } from "../../features/storage/public";
import { CAPABILITY_PORT_DEFINITIONS } from "./ports";
import { isResolvedCapabilityCandidatePlan } from "./resolver";
import {
  isRegisteredCapabilityCandidate,
  registerAcquiredRuntimeCapabilityBinding,
  verifyCandidateAcquisitionFactory,
} from "./validation";
import type {
  AcquiredCapabilityBindings,
  AnyCapabilityAcquisitionFactory,
  AnyRegisteredCapabilityAcquisitionFactory,
  AnyRegisteredRuntimeCapabilityBinding,
  CapabilityAcquiredPort,
  CapabilityAcquisitionFactory,
  CapabilityCandidateResolutionOutcome,
  CapabilityPortKind,
  RegisteredCapabilityAcquisitionFactory,
  RegisteredCapabilityCandidate,
} from "./types";

type Release = () => MaybePromise<void>;
const registeredFactories = new WeakSet<object>();
const factoryCandidates = new WeakMap<object, object>();
const factoryValues = new WeakMap<object, AnyCapabilityAcquisitionFactory>();

const factoryKey = (kind: CapabilityPortKind, bindingId: string): string =>
  `${kind}\u0000${bindingId}`;

const readFactory = (value: unknown): AnyCapabilityAcquisitionFactory => {
  try {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw new TypeError();
    }
    const properties = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
      Object.keys(properties).toSorted().join(",") !== "acquire,bindingId,kind" ||
      !["acquire", "bindingId", "kind"].every((key) => "value" in properties[key]!)
    ) {
      throw new TypeError();
    }
    const kind = properties.kind!.value;
    const bindingId = properties.bindingId!.value;
    const acquire = properties.acquire!.value;
    if (
      typeof kind !== "string" ||
      !Object.hasOwn(CAPABILITY_PORT_DEFINITIONS, kind) ||
      typeof bindingId !== "string" ||
      !isExternalId(bindingId) ||
      isSensitivePortableString(bindingId) ||
      typeof acquire !== "function"
    ) {
      throw new TypeError();
    }
    return Object.freeze({ kind, bindingId, acquire }) as AnyCapabilityAcquisitionFactory;
  } catch {
    throw new TypeError("Capability acquisition factories must use the closed exact contract.");
  }
};

const readAcquiredPort = (value: unknown): CapabilityAcquiredPort => {
  try {
    if (typeof value !== "object" || value === null) throw new TypeError();
    const properties = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(properties).toSorted().join(",");
    if (
      Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
      (keys !== "port" && keys !== "port,release") ||
      !("value" in properties.port!) ||
      (properties.release !== undefined && !("value" in properties.release))
    ) {
      throw new TypeError();
    }
    const port = properties.port!.value;
    const release = properties.release?.value;
    if (
      (typeof port !== "object" && typeof port !== "function") ||
      port === null ||
      (release !== undefined && typeof release !== "function")
    ) {
      throw new TypeError();
    }
    return { port, ...(release === undefined ? {} : { release }) } as CapabilityAcquiredPort;
  } catch {
    throw new TypeError("Capability acquisition must return a port and optional release function.");
  }
};

const releaseResources = (releases: readonly Release[]): MaybePromise<void> => {
  let firstError: unknown;
  let releaseFailed = false;
  const step = (index: number): MaybePromise<void> => {
    if (index < 0) {
      if (releaseFailed) throw firstError;
      return undefined;
    }
    let result: MaybePromise<void>;
    try {
      result = releases[index]!();
    } catch (error) {
      if (!releaseFailed) firstError = error;
      releaseFailed = true;
      return step(index - 1);
    }
    if (!isPromiseLike(result)) return step(index - 1);
    return Promise.resolve(result)
      .catch((error: unknown) => {
        if (!releaseFailed) firstError = error;
        releaseFailed = true;
      })
      .then(() => step(index - 1));
  };
  return step(releases.length - 1);
};

const rollbackAndFail = (releases: readonly Release[], error: unknown): MaybePromise<never> => {
  const rollback = releaseResources(releases);
  if (!isPromiseLike(rollback)) throw error;
  return Promise.resolve(rollback).then(
    () => {
      throw error;
    },
    () => {
      throw error;
    },
  );
};

export const registerCapabilityAcquisitionFactory = <TKind extends CapabilityPortKind>(
  candidate: RegisteredCapabilityCandidate<TKind>,
  value: CapabilityAcquisitionFactory<TKind>,
): RegisteredCapabilityAcquisitionFactory<TKind> => {
  if (!isRegisteredCapabilityCandidate(candidate)) {
    throw new TypeError("Factory registration requires an authentic registered candidate.");
  }
  const factory = readFactory(value) as CapabilityAcquisitionFactory<TKind>;
  if (
    factory.kind !== candidate.kind ||
    factory.bindingId !== candidate.descriptor.bindingId ||
    !verifyCandidateAcquisitionFactory(candidate, {
      kind: factory.kind,
      bindingId: factory.bindingId,
      acquire: factory.acquire,
    })
  ) {
    throw new TypeError("Capability acquisition factory identity verification failed.");
  }
  const registered = Object.freeze({}) as RegisteredCapabilityAcquisitionFactory<TKind>;
  registeredFactories.add(registered);
  factoryCandidates.set(registered, candidate);
  factoryValues.set(registered, factory as AnyCapabilityAcquisitionFactory);
  return registered;
};

export const acquireCapabilityBindings = (
  plan: CapabilityCandidateResolutionOutcome,
  suppliedFactories: readonly AnyRegisteredCapabilityAcquisitionFactory[],
): MaybePromise<AcquiredCapabilityBindings> => {
  if (!isResolvedCapabilityCandidatePlan(plan)) {
    throw new TypeError("Capability acquisition requires an authentic accepted candidate plan.");
  }
  const factories = suppliedFactories.map((registered) => {
    if (
      (typeof registered !== "object" && typeof registered !== "function") ||
      registered === null ||
      !registeredFactories.has(registered)
    ) {
      throw new TypeError("Capability acquisition requires authentic registered factories.");
    }
    const factory = factoryValues.get(registered);
    const candidate = factoryCandidates.get(registered);
    if (!factory || !candidate) {
      throw new TypeError("Capability acquisition requires authentic registered factories.");
    }
    return { factory, candidate };
  });
  const byKey = new Map<
    string,
    {
      readonly factory: AnyCapabilityAcquisitionFactory;
      readonly candidate: object;
    }
  >();
  for (const entry of factories) {
    const { factory } = entry;
    const key = factoryKey(factory.kind, factory.bindingId);
    if (byKey.has(key)) {
      throw new TypeError("Capability acquisition factories contain a duplicate identity.");
    }
    byKey.set(key, entry);
  }
  const selectedKeys = new Set(
    plan.candidates.map((candidate) => factoryKey(candidate.kind, candidate.descriptor.bindingId)),
  );
  if (
    selectedKeys.size !== byKey.size ||
    [...selectedKeys].some((key) => !byKey.has(key)) ||
    [...byKey.keys()].some((key) => !selectedKeys.has(key)) ||
    plan.candidates.some((candidate) => {
      const entry = byKey.get(factoryKey(candidate.kind, candidate.descriptor.bindingId));
      return entry === undefined || entry.candidate !== candidate;
    })
  ) {
    throw new TypeError("Capability acquisition factories must exactly match the accepted plan.");
  }

  const bindings: AnyRegisteredRuntimeCapabilityBinding[] = [];
  const releases: Release[] = [];
  const acquireAt = (index: number): MaybePromise<AcquiredCapabilityBindings> => {
    if (index >= plan.candidates.length) {
      let released = false;
      return Object.freeze({
        bindings: Object.freeze(bindings.slice()),
        release: () => {
          if (released) return undefined;
          released = true;
          return releaseResources(releases);
        },
      });
    }
    const candidate = plan.candidates[index]!;
    const factory = byKey.get(factoryKey(candidate.kind, candidate.descriptor.bindingId))!.factory;
    let acquired: MaybePromise<CapabilityAcquiredPort>;
    try {
      acquired = factory.acquire() as MaybePromise<CapabilityAcquiredPort>;
    } catch (error) {
      return rollbackAndFail(releases, error);
    }
    const accept = (value: CapabilityAcquiredPort): MaybePromise<AcquiredCapabilityBindings> => {
      try {
        const captured = readAcquiredPort(value);
        if (captured.release) releases.push(captured.release);
        const binding = registerAcquiredRuntimeCapabilityBinding(
          candidate as never,
          captured.port as never,
        ) as AnyRegisteredRuntimeCapabilityBinding;
        bindings.push(binding);
        return acquireAt(index + 1);
      } catch (error) {
        return rollbackAndFail(releases, error);
      }
    };
    return isPromiseLike(acquired)
      ? Promise.resolve(acquired).then(accept, (error) => rollbackAndFail(releases, error))
      : accept(acquired);
  };
  return acquireAt(0);
};
