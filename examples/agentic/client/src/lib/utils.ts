import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { compose } from "@geekist/llm-core";

type ClassNameInput = ClassValue[];

const toClassName = compose(twMerge, clsx) as (inputs: ClassNameInput) => string;

export function cn(...inputs: ClassValue[]): string {
  return toClassName(inputs);
}
