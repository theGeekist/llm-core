import { cloneFrozen } from "#shared/portable-data";
import type {
  ConversionReport,
  ProposedSpecificationChange,
  SpecificationAdapterSupport,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationGraph,
  SpecificationSourceSnapshot,
} from "./types";
import {
  assertConversionReport,
  assertPortableSpecificationInput,
  assertProposedSpecificationChange,
  assertSpecificationAdapterSupport,
  assertSpecificationDecision,
  assertSpecificationDecisionRecord,
  assertSpecificationGraph,
  assertSpecificationSourceSnapshot,
} from "./validation";

const capture = <T>(input: T, assertShape: (value: unknown) => void): T => {
  assertPortableSpecificationInput(input);
  assertShape(input);
  return cloneFrozen(input);
};

export const createSpecificationSourceSnapshot = (
  input: SpecificationSourceSnapshot,
): SpecificationSourceSnapshot => capture(input, assertSpecificationSourceSnapshot);

/** Internal graph construction. Cycles are preserved for later derived views. */
export const createSpecificationGraph = (input: SpecificationGraph): SpecificationGraph =>
  capture(input, assertSpecificationGraph);

export const createConversionReport = (input: ConversionReport): ConversionReport =>
  capture(input, assertConversionReport);

export const createSpecificationAdapterSupport = (
  input: SpecificationAdapterSupport,
): SpecificationAdapterSupport => capture(input, assertSpecificationAdapterSupport);

export const createSpecificationDecisionRecord = (
  input: SpecificationDecisionRecord,
): SpecificationDecisionRecord => capture(input, assertSpecificationDecisionRecord);

export const createSpecificationDecision = (input: SpecificationDecision): SpecificationDecision =>
  capture(input, assertSpecificationDecision);

export const createProposedSpecificationChange = (
  input: ProposedSpecificationChange,
): ProposedSpecificationChange => capture(input, assertProposedSpecificationChange);
