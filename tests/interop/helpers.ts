import { mapMaybe } from "#adapters";
import type { AdapterMaybePromise } from "#adapters";

export { mapMaybe };

export const mapMaybeArray = <T, R>(value: AdapterMaybePromise<T[]>, map: (value: T) => R) =>
  mapMaybe(value, (items) => items.map(map));
