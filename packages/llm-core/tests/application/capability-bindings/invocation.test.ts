import { describe, expect, test } from "bun:test";
import {
  coreId,
  externalId,
  type CorrelationId,
  type InvocationContext,
  type InvocationId,
  type PrincipalId,
  type TenantId,
} from "#contracts";
import {
  registerCapabilityInvocation,
  registerRuntimeCapabilityBinding,
} from "../../../src/application/capability-bindings/public";
import {
  createDurableExecutionHandle,
  createLiveContinuation,
  createProviderSessionRef,
  createSnapshot,
} from "../../../src/features/state/public";
import { registerResumableCheckpoint } from "../../../src/features/state/runtime";
import { maybeToAsyncIterable } from "../../../src/shared/maybe";
import { checkpoint, durableJobId, providerSessionId } from "../../state/helpers";
import { passingClaim, runtimeBinding, verificationDependencies } from "./helpers";

const invocationContext = (): InvocationContext => ({
  invocationId: coreId<InvocationId>("0190bd0c-0000-4000-8000-000000000301"),
  correlationId: externalId<CorrelationId>("request:301"),
  principal: { principalId: externalId<PrincipalId>("user:301") },
  tenant: { tenantId: externalId<TenantId>("tenant:301") },
  budget: { maxModelCalls: 2 },
});

describe("capability invocation bridge", () => {
  test("registers an exact immutable InvocationContext without a native escape hatch", () => {
    const source = invocationContext();
    const registered = registerCapabilityInvocation({ invocationContext: source });
    source.principal!.principalId = externalId<PrincipalId>("user:mutated");
    source.budget!.maxModelCalls = 99;

    expect(registered.invocationContext.principal?.principalId).toBe(
      externalId<PrincipalId>("user:301"),
    );
    expect(registered.invocationContext.budget?.maxModelCalls).toBe(2);
    expect(Object.isFrozen(registered.invocationContext)).toBe(true);
    expect(Object.isFrozen(registered.invocationContext.budget)).toBe(true);
    expect(registered.state).toEqual({ kind: "active" });
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: {
          ...invocationContext(),
          secretValue: "placeholder",
        } as unknown as InvocationContext,
      }),
    ).toThrow();
  });

  test("maps pause and resume only through existing typed state lifetimes", () => {
    const continuation = createLiveContinuation({ socket: new Map([["live", true]]) });
    const snapshotSource = { messages: ["hello"] };
    const snapshot = createSnapshot({
      snapshotId: "snapshot:301",
      createdAt: "2026-07-30T00:00:00.000Z",
      value: snapshotSource,
    });
    const registeredCheckpoint = registerResumableCheckpoint(checkpoint());

    expect(
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "paused-live", continuation },
      }).state.kind,
    ).toBe("paused-live");
    const paused = registerCapabilityInvocation({
      invocationContext: invocationContext(),
      state: { kind: "paused-snapshot", snapshot },
    });
    snapshotSource.messages.push("mutated");
    expect(paused.state).toMatchObject({
      kind: "paused-snapshot",
      snapshot: { value: { messages: ["hello"] } },
    });
    expect(
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "resume-checkpoint", checkpoint: registeredCheckpoint },
      }).state.kind,
    ).toBe("resume-checkpoint");
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "resume-checkpoint", checkpoint: continuation as never },
      }),
    ).toThrow();
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: {
          kind: "resume-checkpoint",
          checkpoint: checkpoint() as never,
          token: "legacy",
        } as never,
      }),
    ).toThrow();
  });

  test("keeps provider sessions and durable handles distinct", () => {
    const providerSession = createProviderSessionRef({
      kind: "provider-session-ref",
      providerId: "provider:local",
      sessionId: providerSessionId,
    });
    const durable = createDurableExecutionHandle({
      kind: "durable-execution-handle",
      durableJobId,
      runtime: { runtimeId: "runtime:local", runtimeVersion: "1.0.0" as never },
      opaqueHandle: "job:301",
    });

    expect(
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "continue-provider-session", session: providerSession },
      }).state.kind,
    ).toBe("continue-provider-session");
    expect(
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "signal-durable-execution", handle: durable },
      }).state.kind,
    ).toBe("signal-durable-execution");
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: { kind: "continue-provider-session", session: durable as never },
      }),
    ).toThrow();
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: {
          kind: "continue-provider-session",
          session: {
            ...providerSession,
            secretValue: "placeholder",
          },
        } as never,
      }),
    ).toThrow();
    expect(() =>
      registerCapabilityInvocation({
        invocationContext: invocationContext(),
        state: {
          kind: "signal-durable-execution",
          handle: {
            ...durable,
            runtime: { ...durable.runtime, native: "placeholder" },
          },
        } as never,
      }),
    ).toThrow();
  });

  test("preserves per-port context order, synchronous results and streams", async () => {
    const registeredInvocation = registerCapabilityInvocation({
      invocationContext: invocationContext(),
    });
    const seen: InvocationContext[] = [];
    const retriever = registerRuntimeCapabilityBinding(
      runtimeBinding("retriever", "retriever:context", {
        retrieve: ({ context }) => {
          seen.push(context);
          return { documents: [] };
        },
      }),
      verificationDependencies(),
    );
    const cache = registerRuntimeCapabilityBinding(
      runtimeBinding("cache-store", "cache:context", {
        get: ({ context }) => {
          seen.push(context);
          return null;
        },
        set: () => true,
        delete: () => true,
      }),
      verificationDependencies(),
    );
    const query = registerRuntimeCapabilityBinding(
      runtimeBinding(
        "query-engine",
        "query:context",
        {
          query: ({ context }) => {
            seen.push(context);
            return { content: [] };
          },
          stream: async function* ({ context }) {
            seen.push(context);
            yield { kind: "start" as const };
          },
        },
        [passingClaim("llm-core.retrieval.query.stream", "query:context")],
      ),
      verificationDependencies(),
    );

    const retrieval = retriever.port.retrieve({
      request: { query: { content: [] } },
      context: registeredInvocation.invocationContext,
    });
    const cached = cache.port.get({
      context: registeredInvocation.invocationContext,
      key: "key",
    });
    const stream = query.port.stream!({
      request: { query: { content: [] } },
      context: registeredInvocation.invocationContext,
    });

    expect(retrieval).toEqual({ documents: [] });
    expect(cached).toBeNull();
    const asyncStream = await maybeToAsyncIterable(stream);
    const events = [];
    for await (const event of asyncStream) {
      events.push(event);
    }
    expect(events).toEqual([{ kind: "start" }]);
    expect(seen).toEqual([
      registeredInvocation.invocationContext,
      registeredInvocation.invocationContext,
      registeredInvocation.invocationContext,
    ]);
  });
});
