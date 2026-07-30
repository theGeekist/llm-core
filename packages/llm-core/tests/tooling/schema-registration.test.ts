import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { digest } from "#contracts";
import {
  registerToolSchema,
  validateToolArguments,
  type RegisteredToolSchema,
  type ToolSchemaDigestPort,
} from "../../src/features/tooling/public";

const schemaDigestPort: ToolSchemaDigestPort = {
  digest: (canonicalSchema) => digest(createHash("sha256").update(canonicalSchema).digest("hex")),
};

describe("tool schema registration", () => {
  test("JCS-canonicalizes schemas before SHA-256 registration", async () => {
    const left = await registerToolSchema(
      {
        type: "object",
        required: ["count"],
        properties: { count: { minimum: 0, type: "integer" } },
      },
      schemaDigestPort,
    );
    const reordered = await registerToolSchema(
      {
        properties: { count: { type: "integer", minimum: 0 } },
        required: ["count"],
        type: "object",
      },
      schemaDigestPort,
    );

    expect(left.digest).toEqual(reordered.digest);
  });

  test("any schema-document change changes the registered digest", async () => {
    const integerSchema = await registerToolSchema(
      { type: "object", properties: { count: { type: "integer" } } },
      schemaDigestPort,
    );
    const numberSchema = await registerToolSchema(
      { type: "object", properties: { count: { type: "number" } } },
      schemaDigestPort,
    );

    expect(integerSchema.digest).not.toEqual(numberSchema.digest);
  });

  test("rejects non-JSON and unsafe schema documents before hashing", () => {
    expect(() => registerToolSchema({ minimum: Number.NaN }, schemaDigestPort)).toThrow(TypeError);
  });

  test("rejects forged registered-schema values before argument validation", () => {
    const forged = {
      document: { type: "string" },
      digest: digest("a".repeat(64)),
    } as unknown as RegisteredToolSchema;
    let called = false;

    expect(() =>
      validateToolArguments(forged, "value", {
        validate: () => {
          called = true;
          return { valid: true };
        },
      }),
    ).toThrow(TypeError);
    expect(called).toBe(false);
  });

  test("snapshots hostile digest-port values without invoking getters", async () => {
    let getCalls = 0;
    const value = digest("b".repeat(64));
    const hostile = new Proxy(value, {
      get: (target, key, receiver) => {
        if (key === "algorithm" || key === "value") {
          getCalls += 1;
          return "forged";
        }
        return Reflect.get(target, key, receiver);
      },
    });

    const registered = await registerToolSchema({ type: "string" }, { digest: () => hostile });

    expect(getCalls).toBe(0);
    expect(registered.digest).toEqual(value);
    expect(Object.isFrozen(registered.digest)).toBe(true);
  });

  test("isolates the registered digest from later port-value mutation", async () => {
    const source = digest("d".repeat(64));
    const registered = await registerToolSchema({ type: "string" }, { digest: () => source });

    source.value = "e".repeat(64);
    expect(registered.digest.value).toBe("d".repeat(64));
  });

  test("rejects accessor, symbol-keyed and extra digest-port values", () => {
    const accessor = {
      algorithm: "sha-256",
      get value() {
        return "c".repeat(64);
      },
    };
    const symbolKeyed = { ...digest("c".repeat(64)), [Symbol("hidden")]: true };
    const extra = { ...digest("c".repeat(64)), extra: true };

    for (const value of [accessor, symbolKeyed, extra]) {
      expect(() =>
        registerToolSchema({ type: "string" }, { digest: () => value as never }),
      ).toThrow(TypeError);
    }
  });

  test("rejects digest values whose proxy reflection traps fail", () => {
    const hostile = new Proxy(digest("f".repeat(64)), {
      ownKeys: () => {
        throw new Error("hostile reflection trap");
      },
    });

    expect(() => registerToolSchema({ type: "string" }, { digest: () => hostile })).toThrow(
      TypeError,
    );
  });
});
