import { describe, expect, test } from "bun:test";
import type { ResourceStore } from "../../src/features/storage/public";
import { context, resource } from "./helpers";

describe("resource store", () => {
  test("keeps byte access on an explicitly live port", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const store: ResourceStore = {
      read: (_context, input) => (input.resourceId === resource.resourceId ? bytes.slice() : null),
      write: (_context, input) =>
        input.mediaType === resource.mediaType && input.bytes.byteLength === resource.byteLength
          ? resource
          : null,
      delete: () => null,
    };

    expect(await store.read(context, resource)).toEqual(bytes);
    expect(await store.write(context, { bytes, mediaType: resource.mediaType })).toEqual(resource);
    expect(await store.delete(context, resource)).toBeNull();
    expect(JSON.stringify(resource)).not.toContain("bytes");
  });
});
