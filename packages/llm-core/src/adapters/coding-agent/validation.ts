import { CodingAgentQualificationError } from "./qualification-error";
import type { PortableRecord, PortableValue } from "./portable-snapshot";

export const record = (value: PortableValue, label: string): PortableRecord => {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new CodingAgentQualificationError("malformed-observation", `${label} must be a record.`);
  }
  return value;
};

export const exactKeys = (value: PortableRecord, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CodingAgentQualificationError(
      "open-observation",
      `${label} has an undeclared field.`,
    );
  }
};

export const requiredString = (value: PortableValue | undefined, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new CodingAgentQualificationError(
      "malformed-observation",
      `${label} must be a non-empty string.`,
    );
  }
  return value;
};
