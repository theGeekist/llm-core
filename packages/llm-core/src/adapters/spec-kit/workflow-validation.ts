/* eslint-disable sonarjs/cognitive-complexity -- mirrors Spec Kit's pinned input coercion rules */
import { isPortableRecord } from "#shared/portable-data";
import type { SpecKitWorkflowParseIssue } from "./workflow";

const rejected = (
  issues: SpecKitWorkflowParseIssue[],
  explanation: string,
  location: string,
): void => {
  issues.push({
    code: "spec-kit-workflow-schema-invalid",
    disposition: "rejected",
    explanation,
    location,
  });
};

export const validateInputs = (value: unknown, issues: SpecKitWorkflowParseIssue[]): void => {
  if (value === undefined) return;
  if (!isPortableRecord(value)) {
    rejected(issues, "Workflow inputs must be a mapping when present.", "/inputs");
    return;
  }
  Object.entries(value).forEach(([name, input]) => {
    const location = `/inputs/${name}`;
    if (!isPortableRecord(input)) {
      rejected(issues, "Every workflow input must be a mapping.", location);
      return;
    }
    const inputType = input.type ?? "string";
    if (input.type && !["string", "number", "boolean"].includes(String(input.type))) {
      rejected(
        issues,
        "Workflow input type must be string, number, or boolean.",
        `${location}/type`,
      );
    }
    const enumValues = input.enum;
    if (enumValues !== undefined && enumValues !== null && !Array.isArray(enumValues)) {
      rejected(issues, "Workflow input enum must be a list.", `${location}/enum`);
    }
    if (input.default === undefined) return;
    const defaultValue = input.default;
    const validType =
      inputType === "number"
        ? (typeof defaultValue === "number" && Number.isFinite(defaultValue)) ||
          (typeof defaultValue === "string" &&
            defaultValue.trim().length > 0 &&
            Number.isFinite(Number(defaultValue)))
        : inputType === "boolean"
          ? typeof defaultValue === "boolean" ||
            (typeof defaultValue === "string" &&
              ["true", "1", "yes", "false", "0", "no"].includes(defaultValue.toLowerCase()))
          : inputType === "string"
            ? typeof defaultValue === "string"
            : true;
    if (!validType) {
      rejected(
        issues,
        "Workflow input default does not match its declared type.",
        `${location}/default`,
      );
      return;
    }
    if (
      Array.isArray(enumValues) &&
      !(name === "integration" && defaultValue === "auto") &&
      !enumValues.includes(defaultValue)
    ) {
      rejected(
        issues,
        "Workflow input default must be a member of its enum.",
        `${location}/default`,
      );
    }
  });
};

export const validateRequires = (value: unknown, issues: SpecKitWorkflowParseIssue[]): void => {
  if (value === undefined) return;
  if (!isPortableRecord(value)) {
    rejected(issues, "Workflow requires must be a mapping when present.", "/requires");
    return;
  }
  Object.keys(value).forEach((key) => {
    if (!new Set(["speckit_version", "integrations"]).has(key)) {
      rejected(
        issues,
        `Unknown workflow requires key '${key}'; schema v1.0 only recognizes speckit_version and integrations.`,
        `/requires/${key}`,
      );
    }
  });
};
