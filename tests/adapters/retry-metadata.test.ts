import { describe, expect, it } from "bun:test";
import { readRetryPolicyFromCandidates } from "../../src/adapters/retry-metadata";

describe("Adapter retry metadata", () => {
  it("reads retry policy from direct candidates", () => {
    const policy = readRetryPolicyFromCandidates([{ max_retries: 2, timeout: 5000 }]);

    expect(policy).toEqual({ maxAttempts: 3, backoffMs: 0, timeoutMs: 5000 });
  });

  it("reads retry policy from nested containers", () => {
    const policy = readRetryPolicyFromCandidates([
      {
        retryOptions: { maxRetries: 1 },
        requestOptions: { timeoutMs: 1200 },
      },
    ]);

    expect(policy).toEqual({ maxAttempts: 2, backoffMs: 0, timeoutMs: 1200 });
  });

  it("keeps earlier candidates when merging", () => {
    const policy = readRetryPolicyFromCandidates([
      { maxRetries: 4 },
      { maxRetries: 9, timeoutMs: 1000 },
    ]);

    expect(policy).toEqual({ maxAttempts: 5, backoffMs: 0, timeoutMs: 1000 });
  });

  it("understands num_retries containers", () => {
    const policy = readRetryPolicyFromCandidates([{ retry: { num_retries: 3 } }]);

    expect(policy).toEqual({ maxAttempts: 4, backoffMs: 0 });
  });
});
