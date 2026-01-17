// #region docs
export type KVStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  mget(keys: string[]): Promise<unknown[]>;
  mset(entries: [key: string, value: unknown][]): Promise<void>;
};
// #endregion docs
