import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_NAMESPACE_PATTERN } from "../src/contracts/extensions";

export const CONTRACT_SCHEMA_DRAFT = "http://json-schema.org/draft-07/schema#";
export const CONTRACT_SCHEMA_ID = "https://llm-core.geekist.co/schemas/contracts";

type JsonPrimitive = null | boolean | number | string;
type JsonNode = JsonPrimitive | JsonNode[] | { [key: string]: JsonNode };
type JsonObject = { [key: string]: JsonNode };

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const schemaRoot = resolve(packageRoot, "src/contracts/wire.ts");
const contractsTsconfig = resolve(packageRoot, "tsconfig.contracts.json");
const generatedDirectory = resolve(packageRoot, "src/contracts/generated");
const generatedSchemaPath = resolve(generatedDirectory, "contracts.schema.json");
const generatedDigestPath = resolve(generatedDirectory, "contracts.schema.sha256");

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasAnyKey = (value: JsonObject, keys: string[]): boolean => keys.some((key) => key in value);

const addConstraintType = (value: JsonObject): JsonObject => {
  if ("type" in value) {
    return value;
  }
  if (hasAnyKey(value, ["pattern", "minLength", "maxLength"])) {
    return { ...value, type: "string" };
  }
  if (
    hasAnyKey(value, ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"])
  ) {
    return { ...value, type: "number" };
  }
  return value;
};

const sortJson = (value: JsonNode): JsonNode => {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const sorted: JsonObject = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortJson(child);
    }
  }
  return sorted;
};

/**
 * Draft 7 ignores validation siblings beside `$ref`. Preserve generator
 * annotations and constraints by placing the reference in `allOf`.
 */
const preserveRefSiblings = (value: JsonNode): JsonNode => {
  if (Array.isArray(value)) {
    return value.map(preserveRefSiblings);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const normalized: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    normalized[key] = preserveRefSiblings(child);
  }
  const reference = normalized.$ref;
  if (typeof reference !== "string" || Object.keys(normalized).length === 1) {
    return addConstraintType(normalized);
  }
  delete normalized.$ref;
  return addConstraintType({
    ...normalized,
    allOf: [{ $ref: reference }],
  });
};

const enforceContractSemantics = (schema: JsonObject): JsonObject => {
  const definitions = schema.definitions;
  if (!isJsonObject(definitions)) {
    return schema;
  }
  const nativeExtensions = definitions.NativeExtensions;
  if (!isJsonObject(nativeExtensions)) {
    return schema;
  }
  return {
    ...schema,
    definitions: {
      ...definitions,
      NativeExtensions: {
        ...nativeExtensions,
        propertyNames: { pattern: EXTENSION_NAMESPACE_PATTERN },
      },
    },
  };
};

export const normalizeGeneratedSchema = (schema: JsonObject): JsonObject =>
  sortJson(
    enforceContractSemantics(
      preserveRefSiblings({
        ...schema,
        $id: CONTRACT_SCHEMA_ID,
        $schema: CONTRACT_SCHEMA_DRAFT,
      }) as JsonObject,
    ),
  ) as JsonObject;

export const serializeGeneratedSchema = (schema: JsonObject): string =>
  `${JSON.stringify(normalizeGeneratedSchema(schema), null, 2)}\n`;

export const sha256Hex = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const findGeneratorBinary = (): string => {
  const executable =
    process.platform === "win32" ? "ts-json-schema-generator.cmd" : "ts-json-schema-generator";
  const candidates = [
    resolve(packageRoot, "node_modules/.bin", executable),
    resolve(workspaceRoot, "node_modules/.bin", executable),
  ];
  const binary = candidates.find(existsSync);
  if (binary) {
    return binary;
  }
  throw new Error(
    "Missing exact-pinned dev dependency ts-json-schema-generator. " +
      "Install it at the workspace root before generating contract schemas.",
  );
};

const generateRawSchema = (): JsonObject => {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "llm-core-contract-schema-"));
  const temporaryOutput = resolve(temporaryDirectory, "contracts.schema.json");
  try {
    const result = spawnSync(
      findGeneratorBinary(),
      [
        "--path",
        schemaRoot,
        "--tsconfig",
        contractsTsconfig,
        "--type",
        "ContractSchemaRoots",
        "--id",
        CONTRACT_SCHEMA_ID,
        "--expose",
        "export",
        "--jsDoc",
        "extended",
        "--functions",
        "fail",
        "--strict-tuples",
        "--out",
        temporaryOutput,
      ],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || "schema generation failed";
      throw new Error(detail);
    }
    return JSON.parse(readFileSync(temporaryOutput, "utf8")) as JsonObject;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
};

const readExisting = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, "utf8") : null;

const assertGeneratedFile = (path: string, expected: string): boolean => {
  if (readExisting(path) === expected) {
    return true;
  }
  console.error(`Generated contract artifact is stale: ${path}`);
  return false;
};

const writeGeneratedFile = (path: string, contents: string): void => {
  if (readExisting(path) === contents) {
    return;
  }
  writeFileSync(path, contents);
};

const run = (): void => {
  const schemaBytes = serializeGeneratedSchema(generateRawSchema());
  const digestBytes = `${sha256Hex(schemaBytes)}\n`;
  const check = process.argv.includes("--check");

  if (check) {
    const current =
      assertGeneratedFile(generatedSchemaPath, schemaBytes) &&
      assertGeneratedFile(generatedDigestPath, digestBytes);
    if (!current) {
      process.exitCode = 1;
    }
    return;
  }

  mkdirSync(generatedDirectory, { recursive: true });
  writeGeneratedFile(generatedSchemaPath, schemaBytes);
  writeGeneratedFile(generatedDigestPath, digestBytes);
};

if (import.meta.main) {
  run();
}
