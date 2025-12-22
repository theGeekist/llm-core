import type { AdapterToolParam } from "./types";

// Expects JSON Schema primitive types; unknowns default to "string".
export const adapterParamTypeToJsonType = (type: string) => {
  switch (type) {
    case "string":
    case "number":
    case "boolean":
    case "object":
    case "array":
    case "integer":
      return type;
    default:
      return "string";
  }
};

export const adapterParamsToJsonSchema = (params: AdapterToolParam[] = []) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of params) {
    properties[param.name] = {
      type: adapterParamTypeToJsonType(param.type),
      description: param.description,
    };
    if (param.required) {
      required.push(param.name);
    }
  }
  return {
    type: "object" as const,
    properties,
    required: required.length ? required : undefined,
    additionalProperties: false,
  };
};
