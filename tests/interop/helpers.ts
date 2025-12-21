import { mapMaybe, mapMaybeArray as adapterMapMaybeArray } from "#adapters";
import type { AdapterMaybePromise } from "#adapters";

export { mapMaybe };

export const mapMaybeArray = <T, R>(value: AdapterMaybePromise<T[]>, map: (value: T) => R) =>
  adapterMapMaybeArray(value, map);
