import {
  Comparison,
  Operation,
  StructuredQuery as LangChainStructuredQuery,
  type FilterDirective,
} from "@langchain/core/structured_query";
import type {
  StructuredQuery,
  StructuredQueryComparison,
  StructuredQueryFilter,
  StructuredQueryOperation,
  StructuredQueryValue,
} from "../types";
import { isDefined, isRecord } from "../utils";

const toStructuredQueryValue = (value: unknown): StructuredQueryValue => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return "";
};

const toStructuredQueryComparison = (comparison: Comparison): StructuredQueryComparison => ({
  type: "comparison",
  comparator: comparison.comparator,
  attribute: comparison.attribute,
  value: toStructuredQueryValue(comparison.value),
});

type ComparisonLike = {
  comparator?: unknown;
  attribute?: unknown;
  value?: unknown;
};

const isComparisonLike = (value: unknown): value is ComparisonLike =>
  isRecord(value) && "comparator" in value && "attribute" in value;

const toStructuredQueryComparisonLike = (
  comparison: ComparisonLike,
): StructuredQueryComparison => ({
  type: "comparison",
  comparator: comparison.comparator as StructuredQueryComparison["comparator"],
  attribute: String(comparison.attribute ?? ""),
  value: toStructuredQueryValue(comparison.value),
});

const toStructuredQueryOperation = (operation: Operation): StructuredQueryOperation => ({
  type: "operation",
  operator: operation.operator,
  args: mapFilterArgs(operation.args),
});

type OperationLike = {
  operator?: unknown;
  args?: unknown;
};

const isOperationLike = (value: unknown): value is OperationLike =>
  isRecord(value) && "operator" in value;

const toStructuredQueryOperationLike = (operation: OperationLike): StructuredQueryOperation => ({
  type: "operation",
  operator: operation.operator as StructuredQueryOperation["operator"],
  args: mapFilterArgs(Array.isArray(operation.args) ? operation.args : undefined),
});

const toStructuredQueryFilter = (directive: FilterDirective): StructuredQueryFilter | undefined => {
  if (directive instanceof Comparison) {
    return toStructuredQueryComparison(directive);
  }
  if (directive instanceof Operation) {
    return toStructuredQueryOperation(directive);
  }
  if (isComparisonLike(directive)) {
    return toStructuredQueryComparisonLike(directive);
  }
  if (isOperationLike(directive)) {
    return toStructuredQueryOperationLike(directive);
  }
  return undefined;
};

const mapFilterArgs = (args: FilterDirective[] | undefined) => {
  if (!args || args.length === 0) {
    return undefined;
  }
  const mapped = args.map(toStructuredQueryFilter).filter(isDefined);
  return mapped.length > 0 ? mapped : undefined;
};

export const fromLangChainStructuredQuery = (query: LangChainStructuredQuery): StructuredQuery => ({
  query: query.query,
  filter: query.filter ? toStructuredQueryFilter(query.filter) : undefined,
});
