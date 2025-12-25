const decodeBase64 = (value: string) => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const toBytes = (value: Uint8Array | string) =>
  value instanceof Uint8Array ? value : decodeBase64(value);
