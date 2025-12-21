import { chainMaybe } from "#workflow/maybe";
import type { AdapterMaybePromise } from "#workflow";

export const mapMaybe = <T, R>(value: AdapterMaybePromise<T>, map: (value: T) => R) =>
  chainMaybe(value, map);

export const mapMaybeArray = <T, R>(value: AdapterMaybePromise<T[]>, map: (value: T) => R) =>
  chainMaybe(value, (items) => items.map(map));
