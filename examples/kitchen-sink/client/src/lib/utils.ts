import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { compose } from "../../../../../src/shared/fp";

const toClassName = compose(twMerge, clsx);

export function cn(...inputs: ClassValue[]) {
  return toClassName(inputs);
}
