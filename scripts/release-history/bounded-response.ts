type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface BoundedResponseOptions {
  readonly fetcher?: FetchLike;
  readonly label: string;
  readonly limit: number;
}

export const boundedResponseBytes = async (
  url: string,
  { fetcher = fetch, label, limit }: BoundedResponseOptions,
): Promise<Buffer> => {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${label} failed: ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error(`${label} exceeds size limit`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label} response has no body`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`${label} exceeds size limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
};

export const boundedResponseJson = async (
  url: string,
  options: BoundedResponseOptions,
): Promise<unknown> => JSON.parse((await boundedResponseBytes(url, options)).toString("utf8"));
