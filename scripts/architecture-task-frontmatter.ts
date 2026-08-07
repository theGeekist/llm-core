import type { TaskPlanConfiguration } from "./architecture-task-plan.config";

export interface FrontMatterRecord {
  readonly [key: string]: unknown;
}

interface FieldOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly field: string;
  readonly source: string;
}

export const optionalStringList = (
  value: unknown,
  { configuration, field, source }: FieldOptions,
): readonly string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${source}: ${field} ${configuration.messages.errors.stringList}`);
  }
  return value;
};

export const requiredWriteScope = (
  value: unknown,
  { configuration, field, source }: FieldOptions,
): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(`${source}: ${field} ${configuration.messages.errors.missingWriteScope}`);
  }
  return value;
};

export const requiredString = (
  value: unknown,
  { configuration, field, source }: FieldOptions,
): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${source}: ${field} ${configuration.messages.errors.nonEmptyString}`);
  }
  return value;
};

const governanceKeys = (
  body: string,
  source: string,
  configuration: TaskPlanConfiguration,
): readonly string[] => {
  const lines = body.split("\n");
  const firstContent = lines.find(
    (line) => line.trim() !== "" && !line.trimStart().startsWith("#"),
  );
  if (firstContent !== undefined && /^\s/u.test(firstContent)) {
    throw new Error(`${source}: ${configuration.messages.errors.indentedFrontMatter}`);
  }
  const keys = lines.flatMap((line): readonly string[] => {
    if (line.trim() === "" || line.startsWith("#") || /^\s/u.test(line)) return [];
    const key = line.match(/^([A-Za-z_][A-Za-z\d_-]*):(?:\s|$)/u)?.[1];
    if (key === undefined) {
      throw new Error(`${source}: ${configuration.messages.errors.invalidFrontMatterKey}`);
    }
    return [key];
  });
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate !== undefined) {
    throw new Error(
      `${source}: ${configuration.messages.errors.duplicateFrontMatterKey} ${duplicate}`,
    );
  }
  const allowed = new Set(configuration.frontMatter.allowedTaskFields);
  const unknown = keys.find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new Error(`${source}: ${configuration.messages.errors.unknownFrontMatterKey} ${unknown}`);
  }
  return keys;
};

interface ReadingKeyOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly key: string;
  readonly seen: Set<string>;
  readonly source: string;
}

const addReadingKey = ({ configuration, key, seen, source }: ReadingKeyOptions): void => {
  if (seen.has(key)) {
    throw new Error(`${source}: ${configuration.messages.errors.duplicateReadingField} ${key}`);
  }
  seen.add(key);
};

const validateRequiredReadingKeys = (
  body: string,
  source: string,
  configuration: TaskPlanConfiguration,
): void => {
  const lines = body.split("\n");
  const field = configuration.frontMatter.requiredReading;
  const start = lines.findIndex(
    (line) => line.match(/^([A-Za-z_][A-Za-z\d_-]*):(?:\s|$)/u)?.[1] === field,
  );
  if (start < 0) return;
  let seen: Set<string> | null = null;
  let propertyIndent = -1;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/u.test(line)) break;
    const item = line.match(/^(\s*)-\s+([A-Za-z_][A-Za-z\d_-]*):(?:\s|$)/u);
    if (item !== null) {
      seen = new Set<string>();
      propertyIndent = item[1]!.length + 2;
      addReadingKey({ configuration, key: item[2]!, seen, source });
      continue;
    }
    const sequenceIndent = line.match(/^(\s*)-/u)?.[1]?.length;
    if (sequenceIndent !== undefined && (seen === null || sequenceIndent < propertyIndent)) {
      throw new Error(`${source}: ${configuration.messages.errors.invalidReadingEntry}`);
    }
    const indent = line.match(/^\s*/u)![0].length;
    if (seen === null || indent !== propertyIndent) continue;
    const property = line.match(/^\s*([A-Za-z_][A-Za-z\d_-]*):(?:\s|$)/u);
    if (property === null) {
      throw new Error(`${source}: ${configuration.messages.errors.invalidReadingEntry}`);
    }
    addReadingKey({ configuration, key: property[1]!, seen, source });
  }
};

export const parseTaskFrontMatter = (
  content: string,
  source: string,
  configuration: TaskPlanConfiguration,
): FrontMatterRecord => {
  const normalized = content.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${source}: ${configuration.messages.errors.missingFrontMatter}`);
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    throw new Error(`${source}: ${configuration.messages.errors.unterminatedFrontMatter}`);
  }
  const body = normalized.slice(4, closing);
  governanceKeys(body, source, configuration);
  validateRequiredReadingKeys(body, source, configuration);
  const parsed: unknown = Bun.YAML.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${source}: ${configuration.messages.errors.frontMatterMapping}`);
  }
  const allowed = new Set(configuration.frontMatter.allowedTaskFields);
  const unknown = Object.keys(parsed).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new Error(`${source}: ${configuration.messages.errors.unknownFrontMatterKey} ${unknown}`);
  }
  return parsed as FrontMatterRecord;
};
