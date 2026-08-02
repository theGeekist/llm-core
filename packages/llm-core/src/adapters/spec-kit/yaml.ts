/* eslint-disable max-params, sonarjs/cognitive-complexity, sonarjs/updated-loop-counter -- small recursive parser for the pinned dependency-free YAML subset */
import type { JsonObject, JsonValue } from "#contracts";

interface YamlLine {
  readonly indent: number;
  readonly text: string;
  readonly line: number;
}

const syntaxError = (line: number, message: string): never => {
  throw new TypeError(`Spec Kit workflow YAML line ${line}: ${message}.`);
};

const stripComment = (value: string): string => {
  let single = false;
  let double = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (double) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') double = false;
      continue;
    }
    if (single) {
      if (character === "'" && value[index + 1] === "'") index += 1;
      else if (character === "'") single = false;
      continue;
    }
    if (character === '"') double = true;
    else if (character === "'") single = true;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") depth -= 1;
    else if (character === "#" && depth === 0 && (index === 0 || /\s/.test(value[index - 1]!))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
};

const linesFor = (content: string): readonly YamlLine[] => {
  const lines: YamlLine[] = [];
  content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .forEach((raw, index) => {
      const leading = raw.match(/^[ \t]*/)?.[0] ?? "";
      if (leading.includes("\t"))
        syntaxError(index + 1, "tab indentation is outside the supported portable subset");
      const text = stripComment(raw.slice(leading.length));
      if (text.length === 0 || text === "---" || text === "...") return;
      if (text.startsWith("%")) {
        syntaxError(
          index + 1,
          "directives, tags, anchors, and aliases are outside the supported portable subset",
        );
      }
      lines.push({ indent: leading.length, text, line: index + 1 });
    });
  return lines;
};

const splitTopLevel = (value: string, delimiter: string, line: number): readonly string[] => {
  const parts: string[] = [];
  let start = 0;
  let single = false;
  let double = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (double) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') double = false;
      continue;
    }
    if (single) {
      if (character === "'" && value[index + 1] === "'") index += 1;
      else if (character === "'") single = false;
      continue;
    }
    if (character === '"') double = true;
    else if (character === "'") single = true;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") depth -= 1;
    else if (character === delimiter && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) syntaxError(line, "unbalanced flow collection");
  }
  if (single || double || depth !== 0)
    syntaxError(line, "unterminated quoted scalar or flow collection");
  parts.push(value.slice(start).trim());
  return parts;
};

const keyValue = (value: string, line: number): readonly [key: string, value: string] | null => {
  const parts = splitTopLevel(value, ":", line);
  if (parts.length === 1) return null;
  const [rawKey, ...rest] = parts;
  const rawValue = rest.join(":").trim();
  if (!rawKey) syntaxError(line, "mapping key must be non-empty");
  const key = parseScalar(rawKey!, line);
  if (typeof key !== "string") {
    syntaxError(line, "mapping keys must resolve to text in the portable subset");
  }
  return [key as string, rawValue];
};

const parseFlowObject = (value: string, line: number): JsonObject => {
  const result: Record<string, JsonValue> = {};
  const body = value.slice(1, -1).trim();
  if (body.length === 0) return result;
  for (const entry of splitTopLevel(body, ",", line)) {
    const pair = keyValue(entry, line);
    if (pair === null) syntaxError(line, "flow mapping entry requires a key and value");
    const [key, raw] = pair!;
    if (Object.hasOwn(result, key))
      syntaxError(line, `duplicate mapping key ${JSON.stringify(key)}`);
    result[key] = parseScalar(raw, line);
  }
  return result;
};

const safeInteger = (value: number, line: number): number => {
  if (!Number.isSafeInteger(value)) {
    syntaxError(line, "integer scalar must be exactly representable as portable JSON");
  }
  return Object.is(value, -0) ? 0 : value;
};

const parseScalar = (raw: string, line: number): JsonValue => {
  const value = raw.trim();
  if (value === "" || value === "null" || value === "Null" || value === "NULL" || value === "~")
    return null;
  // PyYAML safe_load uses YAML 1.1 boolean resolution. This intentionally
  // includes yes/no and on/off rather than the narrower YAML 1.2 spellings.
  if (/^(?:true|yes|on)$/i.test(value)) return true;
  if (/^(?:false|no|off)$/i.test(value)) return false;
  if (/^[+-]?(?:0|[1-9][\d_]*)$/.test(value)) {
    const number = Number(value.replaceAll("_", ""));
    return safeInteger(number, line);
  }
  if (
    /^[+-]?\d[\d_]*\.[\d_]*(?:[eE][+-]\d+)?$/.test(value) ||
    /^\.\d[\d_]*(?:[eE][+-]\d+)?$/.test(value)
  ) {
    const number = Number(value.replaceAll("_", ""));
    if (!Number.isFinite(number)) syntaxError(line, "numeric scalar must be finite");
    return number;
  }
  if (/^[+-]?0b[01_]+$/i.test(value)) {
    const sign = value.startsWith("-") ? -1 : 1;
    return safeInteger(
      sign * Number.parseInt(value.replace(/^[+-]?0b/i, "").replaceAll("_", ""), 2),
      line,
    );
  }
  if (/^[+-]?0x[\da-f_]+$/i.test(value)) {
    const sign = value.startsWith("-") ? -1 : 1;
    return safeInteger(
      sign * Number.parseInt(value.replace(/^[+-]?0x/i, "").replaceAll("_", ""), 16),
      line,
    );
  }
  if (/^[+-]?0[0-7_]+$/.test(value)) {
    const sign = value.startsWith("-") ? -1 : 1;
    return safeInteger(
      sign * Number.parseInt(value.replace(/^[+-]?0/, "").replaceAll("_", ""), 8),
      line,
    );
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "string") syntaxError(line, "double-quoted scalar must be text");
      return parsed as string;
    } catch {
      syntaxError(line, "invalid double-quoted scalar");
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) syntaxError(line, "invalid single-quoted scalar");
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    return body.length === 0
      ? []
      : splitTopLevel(body, ",", line).map((item) => parseScalar(item, line));
  }
  if (value.startsWith("{") && value.endsWith("}")) return parseFlowObject(value, line);
  if (/^[&*!][^\s]*/.test(value)) {
    syntaxError(line, "tags, anchors, and aliases are outside the supported portable subset");
  }
  if (
    /^[+-]?\.(?:inf|nan)$/i.test(value) ||
    /^\d{4}-\d{2}-\d{2}(?:$|[Tt]|(?:[ \t]+)\d)/.test(value) ||
    /^[+-]?\d[\d_]*(?::[0-5]?\d)+(?:\.\d[\d_]*)?$/.test(value)
  ) {
    syntaxError(
      line,
      "non-finite, timestamp, and sexagesimal scalars are outside the portable subset",
    );
  }
  if (value === "|" || value === ">" || value.startsWith("!!")) {
    syntaxError(
      line,
      "block scalars and explicit YAML tags are outside the supported portable subset",
    );
  }
  return value;
};

interface ParseResult {
  readonly value: JsonValue;
  readonly next: number;
}

const parseBlock = (lines: readonly YamlLine[], start: number, indent: number): ParseResult => {
  const first = lines[start];
  if (first === undefined || first.indent !== indent)
    syntaxError(first?.line ?? 1, "invalid indentation");
  return first!.text === "-" || first!.text.startsWith("- ")
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
};

const valueAfter = (
  lines: readonly YamlLine[],
  next: number,
  parentIndent: number,
  raw: string,
  line: number,
): ParseResult => {
  if (raw.length > 0) return { value: parseScalar(raw, line), next };
  const child = lines[next];
  if (child === undefined || child.indent < parentIndent) return { value: null, next };
  if (child.indent === parentIndent && child.text !== "-" && !child.text.startsWith("- ")) {
    return { value: null, next };
  }
  return parseBlock(lines, next, child.indent);
};

const parseMappingEntry = (
  result: Record<string, JsonValue>,
  lines: readonly YamlLine[],
  index: number,
  indent: number,
  text: string,
  line: number,
): number => {
  const pair = keyValue(text, line);
  if (pair === null) syntaxError(line, "mapping entry requires a key followed by ':'");
  const [key, raw] = pair!;
  if (Object.hasOwn(result, key)) syntaxError(line, `duplicate mapping key ${JSON.stringify(key)}`);
  const parsed = valueAfter(lines, index + 1, indent, raw, line);
  result[key] = parsed.value;
  return parsed.next;
};

const parseMapping = (
  lines: readonly YamlLine[],
  start: number,
  indent: number,
  initial?: Record<string, JsonValue>,
): ParseResult => {
  const result = initial ?? {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.indent < indent) break;
    if (line.indent > indent) syntaxError(line.line, "unexpected indentation in mapping");
    if (line.text === "-" || line.text.startsWith("- ")) break;
    index = parseMappingEntry(result, lines, index, indent, line.text, line.line);
  }
  return { value: result, next: index };
};

const parseSequence = (lines: readonly YamlLine[], start: number, indent: number): ParseResult => {
  const result: JsonValue[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.indent < indent) break;
    if (line.indent !== indent || (line.text !== "-" && !line.text.startsWith("- "))) break;
    const rest = line.text.slice(1).trimStart();
    if (rest.length === 0) {
      const child = lines[index + 1];
      if (child === undefined || child.indent <= indent)
        syntaxError(line.line, "sequence item requires a value");
      const parsed = parseBlock(lines, index + 1, child!.indent);
      result.push(parsed.value);
      index = parsed.next;
      continue;
    }
    const pair = keyValue(rest, line.line);
    if (pair === null) {
      result.push(parseScalar(rest, line.line));
      index += 1;
      continue;
    }
    const item: Record<string, JsonValue> = {};
    const [key, raw] = pair;
    const first = valueAfter(lines, index + 1, indent + 1, raw, line.line);
    item[key] = first.value;
    index = first.next;
    const continuation = lines[index];
    if (continuation !== undefined && continuation.indent > indent) {
      const parsed = parseMapping(lines, index, continuation.indent, item);
      index = parsed.next;
    }
    result.push(item);
  }
  return { value: result, next: index };
};

/** Parse the portable YAML subset used by the pinned Spec Kit workflow and overlay fixtures. */
export const parseSpecKitWorkflowYaml = (content: string): JsonObject => {
  const lines = linesFor(content);
  if (lines.length === 0) throw new TypeError("Spec Kit workflow YAML must not be empty.");
  if (lines[0]!.indent !== 0) syntaxError(lines[0]!.line, "root mapping must start at column one");
  const parsed = parseBlock(lines, 0, 0);
  if (
    parsed.next !== lines.length ||
    Array.isArray(parsed.value) ||
    parsed.value === null ||
    typeof parsed.value !== "object"
  ) {
    throw new TypeError("Spec Kit workflow YAML must contain exactly one root mapping.");
  }
  return parsed.value;
};
