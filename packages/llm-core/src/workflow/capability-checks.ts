// References: docs/stage-8.md (adapter validation helpers)

export const isCapabilitySatisfied = (value: unknown) => {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return true;
};
