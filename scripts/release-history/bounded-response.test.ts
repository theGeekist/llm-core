import { describe, expect, test } from "bun:test";
import { boundedResponseBytes } from "./bounded-response";

describe("bounded release responses", () => {
  test("rejects declared and streamed bodies beyond the limit", async () => {
    await expect(
      boundedResponseBytes("https://registry.npmjs.org/archive", {
        label: "archive",
        limit: 4,
        fetcher: async () => new Response("12345", { headers: { "content-length": "5" } }),
      }),
    ).rejects.toThrow("exceeds size limit");
    await expect(
      boundedResponseBytes("https://registry.npmjs.org/archive", {
        label: "archive",
        limit: 4,
        fetcher: async () => new Response("12345"),
      }),
    ).rejects.toThrow("exceeds size limit");
  });

  test("passes a timeout signal to the fetch boundary", async () => {
    let signal: AbortSignal | undefined;
    await boundedResponseBytes("https://registry.npmjs.org/archive", {
      label: "archive",
      limit: 4,
      fetcher: async (_, init) => {
        signal = init?.signal ?? undefined;
        return new Response("1234");
      },
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
