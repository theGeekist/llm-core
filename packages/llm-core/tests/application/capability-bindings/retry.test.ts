import { describe, expect, test } from "bun:test";
import type { CapabilityClaim } from "#contracts";
import {
  executeWithQualifiedRetry,
  registerRuntimeCapabilityBinding,
  RETRY_GUARANTEE_CAPABILITIES,
} from "../../../src/application/capability-bindings/public";
import {
  conditionalClaim,
  passingClaim,
  runtimeBinding,
  verificationDependencies,
} from "./capability-binding-fixtures";

const retrieverBinding = (claims: CapabilityClaim[] = []) =>
  registerRuntimeCapabilityBinding(
    runtimeBinding("retriever", "retriever:retry", { retrieve: () => ({ documents: [] }) }, claims),
    verificationDependencies(),
  );

describe("qualified capability retry", () => {
  test("defaults to exactly one synchronous attempt", () => {
    let attempts = 0;
    const result = executeWithQualifiedRetry({
      binding: retrieverBinding(),
      effect: "read-only",
      phase: "before-start",
      call: () => {
        attempts += 1;
        return "sync";
      },
    });

    expect(result).toBe("sync");
    expect(result).not.toBeInstanceOf(Promise);
    expect(attempts).toBe(1);
  });

  test("fails before invocation when retry guarantee evidence is missing", () => {
    let attempts = 0;
    expect(() =>
      executeWithQualifiedRetry({
        binding: retrieverBinding(),
        effect: "read-only",
        phase: "before-start",
        policy: {
          maxAttempts: 2,
          delayMs: 0,
          retryOn: ["network"],
          guarantee: "read-only",
        },
        classifyFailure: () => "network",
        call: () => {
          attempts += 1;
          throw new Error("native failure");
        },
      }),
    ).toThrow("lacks supported verified");
    expect(attempts).toBe(0);
  });

  test("rejects unbounded or open retry policy before invocation", () => {
    let attempts = 0;
    const binding = retrieverBinding([
      passingClaim(RETRY_GUARANTEE_CAPABILITIES.idempotent, "retriever:retry"),
    ]);
    for (const policy of [
      {
        maxAttempts: 11,
        delayMs: 0,
        retryOn: ["network"],
        guarantee: "idempotent",
      },
      {
        maxAttempts: 2,
        delayMs: 0,
        retryOn: ["network"],
        guarantee: "read-only",
        native: "placeholder",
      },
    ]) {
      expect(() =>
        executeWithQualifiedRetry({
          binding,
          effect: "read-only",
          phase: "before-start",
          policy: policy as never,
          classifyFailure: () => "network",
          call: () => {
            attempts += 1;
            return "unsafe";
          },
        }),
      ).toThrow("closed, bounded");
    }
    expect(attempts).toBe(0);
  });

  test("rejects inherited guarantee names before a single attempt", () => {
    let attempts = 0;
    expect(() =>
      executeWithQualifiedRetry({
        binding: retrieverBinding(),
        effect: "read-only",
        phase: "before-start",
        policy: {
          maxAttempts: 1,
          delayMs: 0,
          retryOn: ["network"],
          guarantee: "toString",
        } as never,
        call: () => {
          attempts += 1;
          return "unsafe";
        },
      }),
    ).toThrow("closed, bounded");
    expect(attempts).toBe(0);
  });

  test("retries synchronously only under an exact supported guarantee", () => {
    let attempts = 0;
    const binding = retrieverBinding([
      passingClaim(RETRY_GUARANTEE_CAPABILITIES.idempotent, "retriever:retry"),
    ]);
    const result = executeWithQualifiedRetry({
      binding,
      effect: "read-only",
      phase: "before-start",
      policy: {
        maxAttempts: 2,
        delayMs: 0,
        retryOn: ["network"],
        guarantee: "idempotent",
      },
      classifyFailure: () => "network",
      call: () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("native failure");
        }
        return "recovered";
      },
    });

    expect(result).toBe("recovered");
    expect(result).not.toBeInstanceOf(Promise);
    expect(attempts).toBe(2);
  });

  test("never blind-retries meaningful after-start effects", () => {
    const readOnly = retrieverBinding([
      passingClaim(RETRY_GUARANTEE_CAPABILITIES["read-only"], "retriever:retry"),
    ]);
    expect(() =>
      executeWithQualifiedRetry({
        binding: readOnly,
        effect: "meaningful",
        phase: "after-start",
        policy: {
          maxAttempts: 2,
          delayMs: 0,
          retryOn: ["server"],
          guarantee: "read-only",
        },
        classifyFailure: () => "server",
        call: () => "unsafe",
      }),
    ).toThrow("Meaningful effects");

    let attempts = 0;
    const idempotent = retrieverBinding([
      passingClaim(RETRY_GUARANTEE_CAPABILITIES.idempotent, "retriever:retry"),
    ]);
    const result = executeWithQualifiedRetry({
      binding: idempotent,
      effect: "meaningful",
      phase: "after-start",
      policy: {
        maxAttempts: 2,
        delayMs: 0,
        retryOn: ["server"],
        guarantee: "idempotent",
      },
      classifyFailure: () => "server",
      call: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("unknown native disposition");
        return "proved-safe";
      },
    });
    expect(result).toBe("proved-safe");
    expect(attempts).toBe(2);
  });

  test("does not treat conditional evidence as an after-start guarantee", () => {
    const binding = retrieverBinding([
      conditionalClaim(RETRY_GUARANTEE_CAPABILITIES.reconciled, "retriever:retry"),
    ]);
    expect(() =>
      executeWithQualifiedRetry({
        binding,
        effect: "meaningful",
        phase: "after-start",
        policy: {
          maxAttempts: 2,
          delayMs: 0,
          retryOn: ["timeout"],
          guarantee: "reconciled",
        },
        classifyFailure: () => "timeout",
        call: () => "unsafe",
      }),
    ).toThrow("lacks supported verified");
  });

  test("uses an explicit scheduler for delayed asynchronous retry", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const binding = retrieverBinding([
      passingClaim(RETRY_GUARANTEE_CAPABILITIES.idempotent, "retriever:retry"),
    ]);
    const result = executeWithQualifiedRetry({
      binding,
      effect: "read-only",
      phase: "before-start",
      policy: {
        maxAttempts: 2,
        delayMs: 5,
        retryOn: ["rate-limit"],
        guarantee: "idempotent",
      },
      classifyFailure: () => "rate-limit",
      scheduler: {
        wait: (delayMs) => {
          delays.push(delayMs);
          return Promise.resolve();
        },
      },
      call: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("native rate limit payload");
        return "done";
      },
    });

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe("done");
    expect(delays).toEqual([5]);
  });

  test("event projection failure does not retry without an explicit guarantee", async () => {
    let emissions = 0;
    const sink = registerRuntimeCapabilityBinding(
      runtimeBinding("event-sink", "sink:a", {
        emit: async () => {
          emissions += 1;
          throw new Error("delivery failed");
        },
      }),
      verificationDependencies(),
    );
    const result = executeWithQualifiedRetry({
      binding: sink,
      effect: "meaningful",
      phase: "after-start",
      call: () => sink.port.emit({} as never),
    });

    await expect(result).rejects.toThrow("delivery failed");
    expect(emissions).toBe(1);
  });

  test("does not replay a mixed-effect store write labeled read-only after start", () => {
    let writes = 0;
    const binding = registerRuntimeCapabilityBinding(
      runtimeBinding(
        "cache-store",
        "cache:mixed",
        {
          get: () => null,
          set: () => {
            writes += 1;
            throw new Error("unknown write disposition");
          },
          delete: () => true,
        },
        [passingClaim(RETRY_GUARANTEE_CAPABILITIES["read-only"], "cache:mixed")],
      ),
      verificationDependencies(),
    );
    expect(() =>
      executeWithQualifiedRetry({
        binding,
        effect: "read-only",
        phase: "after-start",
        policy: {
          maxAttempts: 2,
          delayMs: 0,
          retryOn: ["network"],
          guarantee: "read-only",
        },
        classifyFailure: () => "network",
        call: () =>
          binding.port.set({
            context: {} as never,
            key: "key",
            value: { kind: "json", value: "value" },
          }),
      }),
    ).toThrow("idempotency or reconciliation");
    expect(writes).toBe(0);
  });

  test("rejects a before-start mislabeled non-tool write before invocation", () => {
    let writes = 0;
    const binding = registerRuntimeCapabilityBinding(
      runtimeBinding(
        "cache-store",
        "cache:before-start",
        {
          get: () => null,
          set: () => {
            writes += 1;
            throw new Error("write happened");
          },
          delete: () => true,
        },
        [passingClaim(RETRY_GUARANTEE_CAPABILITIES["read-only"], "cache:before-start")],
      ),
      verificationDependencies(),
    );
    expect(() =>
      executeWithQualifiedRetry({
        binding,
        effect: "read-only",
        phase: "before-start",
        policy: {
          maxAttempts: 2,
          delayMs: 0,
          retryOn: ["network"],
          guarantee: "read-only",
        },
        classifyFailure: () => "network",
        call: () =>
          binding.port.set({
            context: {} as never,
            key: "key",
            value: { kind: "json", value: "value" },
          }),
      }),
    ).toThrow("idempotency or reconciliation");
    expect(writes).toBe(0);
  });
});
