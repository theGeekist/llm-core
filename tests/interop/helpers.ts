import { mapMaybe, mapMaybeArray as adapterMapMaybeArray } from "#adapters";
import type { MaybePromise } from "#adapters";

export { mapMaybe };

export const mapMaybeArray = <T, R>(value: MaybePromise<T[]>, map: (value: T) => R) =>
  adapterMapMaybeArray(value, map);
