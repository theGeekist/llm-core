import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { registryIntegrity, verifyPublishedArchive } from "./download-published-package";

describe("published package archive verification", () => {
  test("accepts every archive only with its exact npm integrity", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (archive) => {
        expect(() =>
          verifyPublishedArchive(archive, registryIntegrity(archive), "@aifsd/example@1.0.0"),
        ).not.toThrow();
      }),
    );
  });

  test("rejects changed bytes under the original integrity", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 4096 }), (archive) => {
        const changed = Uint8Array.from(archive);
        changed[0] = (changed[0] ?? 0) ^ 0xff;
        expect(() =>
          verifyPublishedArchive(changed, registryIntegrity(archive), "@aifsd/example@1.0.0"),
        ).toThrow("do not match registry integrity");
      }),
    );
  });
});
