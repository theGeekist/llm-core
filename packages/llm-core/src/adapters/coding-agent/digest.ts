import { createHash } from "node:crypto";

export const sha256Evidence = (value: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
