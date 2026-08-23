import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MAX_MS = 60_000;
const LOCK_TIMEOUT_MAX_MS = 86_400_000;
const monotonicNow = performance.now.bind(performance);
const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;
interface LockOwner {
  readonly incarnation: string | null;
  readonly pid: number;
  readonly token: string;
}
export type AtomicDocumentCommitPhase = "after-file-sync" | "after-rename" | "after-directory-sync";
export interface AtomicDocumentFileOptions {
  readonly commitFault?: (phase: AtomicDocumentCommitPhase) => Promise<void> | void;
  readonly directorySyncObserver?: (path: string) => Promise<void> | void;
  readonly lockLinkedObserver?: (path: string) => Promise<void> | void;
  readonly lockRetryMs?: number;
  readonly lockTimeoutMs?: number;
}
interface AtomicDocumentFileDefinition<Document> {
  readonly decode: (value: unknown) => Document;
  readonly encode: (document: Document) => unknown;
  readonly filePath: string;
  readonly lockName: string;
  readonly options?: AtomicDocumentFileOptions;
}
interface AtomicDocumentTransition<Document, Value> {
  readonly replacement: Document | null;
  readonly value: Value;
}
export interface AtomicDocumentFile<Document> {
  readonly read: () => Promise<Document | null>;
  readonly transact: <Value>(
    transition: (
      current: Document | null,
    ) =>
      | Promise<AtomicDocumentTransition<Document, Value>>
      | AtomicDocumentTransition<Document, Value>,
  ) => Promise<{ readonly document: Document | null; readonly value: Value }>;
}
interface LockDurationBoundary {
  readonly fallback: number;
  readonly maximum: number;
  readonly name: string;
}

const lockDuration = (
  value: number | undefined,
  { fallback, maximum, name }: LockDurationBoundary,
): number => {
  const duration = value ?? fallback;
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > maximum) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${maximum}`);
  }
  return duration;
};

const validateOptions = (options: AtomicDocumentFileOptions): AtomicDocumentFileOptions => {
  const lockRetryMs = lockDuration(options.lockRetryMs, {
    fallback: LOCK_RETRY_MS,
    maximum: LOCK_RETRY_MAX_MS,
    name: "lockRetryMs",
  });
  const lockTimeoutMs = lockDuration(options.lockTimeoutMs, {
    fallback: LOCK_TIMEOUT_MS,
    maximum: LOCK_TIMEOUT_MAX_MS,
    name: "lockTimeoutMs",
  });
  if (lockRetryMs > lockTimeoutMs) {
    throw new RangeError("lockRetryMs must not exceed lockTimeoutMs");
  }
  return { ...options, lockRetryMs, lockTimeoutMs };
};

const lockOwner = (value: unknown, lockName: string): LockOwner => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.keys(value).length !== 2 && Object.keys(value).length !== 3) ||
    Object.keys(value).some((key) => key !== "incarnation" && key !== "pid" && key !== "token") ||
    !Object.hasOwn(value, "pid") ||
    !Object.hasOwn(value, "token") ||
    !Number.isSafeInteger((value as { readonly pid?: unknown }).pid) ||
    Number((value as { readonly pid?: unknown }).pid) <= 0 ||
    (Object.hasOwn(value, "incarnation") &&
      (typeof (value as { readonly incarnation?: unknown }).incarnation !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          String((value as { readonly incarnation?: unknown }).incarnation),
        ))) ||
    typeof (value as { readonly token?: unknown }).token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      String((value as { readonly token?: unknown }).token),
    )
  ) {
    throw new TypeError(`${lockName[0]!.toUpperCase()}${lockName.slice(1)} lock owner is invalid`);
  }
  return {
    incarnation: Object.hasOwn(value, "incarnation")
      ? (value as { readonly incarnation: string }).incarnation
      : null,
    pid: (value as { readonly pid: number }).pid,
    token: (value as { readonly token: string }).token,
  };
};

const readLockOwner = async (path: string, lockName: string): Promise<LockOwner | null> => {
  try {
    return lockOwner(JSON.parse(await readFile(path, "utf8")) as unknown, lockName);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
};

const canonicalDirectory = async (path: string): Promise<string> => {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      const canonical = await realpath(current);
      if (!(await stat(canonical)).isDirectory()) {
        throw new TypeError(`Atomic document parent is not a directory: ${current}`);
      }
      return join(canonical, ...missing.toReversed());
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      missing.push(basename(current));
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
};

const validateExistingTarget = async (target: string): Promise<void> => {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new TypeError("Atomic document target must be a single-link regular file");
  }
};

/**
 * Resolves aliases before authority paths are derived. Correctness assumes the
 * canonical parent is service-owned and is not replaced adversarially later.
 */
const canonicalDocumentTarget = async (filePath: string): Promise<string> => {
  const absolute = resolve(filePath);
  const target = join(await canonicalDirectory(dirname(absolute)), basename(absolute));
  await validateExistingTarget(target);
  return target;
};

// PID existence is deliberately fail-closed. PID reuse may delay recovery, but
// never authorises stealing a lock from a process that could still be its owner.
const ownerProcessIsAlive = (owner: LockOwner): boolean => processIsAlive(owner.pid);

const ownerPath = (lockPath: string, token: string): string => `${lockPath}.${token}.owner`;

const releaseLock = async (lockPath: string, lockName: string, owner: LockOwner): Promise<void> => {
  const current = await readLockOwner(lockPath, lockName);
  if (
    current?.token === owner.token &&
    current.pid === owner.pid &&
    current.incarnation === owner.incarnation
  ) {
    await rm(lockPath, { force: true });
  }
  await rm(ownerPath(lockPath, owner.token), { force: true });
};

const reclaimDeadLock = async (
  lockPath: string,
  lockName: string,
  options: AtomicDocumentFileOptions,
): Promise<boolean> => {
  const guardPath = `${lockPath}.reclaim`;
  const guard = await acquireReclaimGuard(guardPath, lockName, options);
  if (guard === null) return false;
  try {
    const observed = await readLockOwner(lockPath, lockName);
    if (observed === null) return true;
    if (ownerProcessIsAlive(observed)) return false;
    const confirmed = await readLockOwner(lockPath, lockName);
    if (
      confirmed?.token !== observed.token ||
      confirmed.pid !== observed.pid ||
      confirmed.incarnation !== observed.incarnation
    )
      return false;
    const stalePath = `${lockPath}.${observed.token}.stale`;
    await rename(lockPath, stalePath);
    await rm(stalePath, { force: true });
    await rm(ownerPath(lockPath, observed.token), { force: true });
    return true;
  } finally {
    await releaseLock(guardPath, `${lockName} reclaim`, guard);
  }
};

const removeOwnerlessGuardDirectory = async (path: string, error: unknown): Promise<boolean> => {
  if (errorCode(error) !== "EISDIR") throw error;
  try {
    await rmdir(path);
    return true;
  } catch (directoryError) {
    if (errorCode(directoryError) === "ENOENT") return true;
    if (errorCode(directoryError) === "ENOTEMPTY") return false;
    throw directoryError;
  }
};

const reclaimOwnedFile = async (path: string, lockName: string): Promise<boolean> => {
  let observed: LockOwner | null;
  try {
    observed = await readLockOwner(path, lockName);
  } catch (error) {
    return await removeOwnerlessGuardDirectory(path, error);
  }
  if (observed === null) return true;
  if (ownerProcessIsAlive(observed)) return false;
  const confirmed = await readLockOwner(path, lockName);
  if (
    confirmed?.token !== observed.token ||
    confirmed.pid !== observed.pid ||
    confirmed.incarnation !== observed.incarnation
  )
    return false;
  const stalePath = `${path}.${observed.token}.stale`;
  try {
    await rename(path, stalePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return true;
    throw error;
  }
  await rm(stalePath, { force: true });
  await rm(ownerPath(path, observed.token), { force: true });
  return true;
};

const acquireReclaimGuard = async (
  guardPath: string,
  lockName: string,
  options: AtomicDocumentFileOptions,
): Promise<LockOwner | null> => {
  for (;;) {
    const owner = await tryAcquireOwnedFile(guardPath, `${lockName} reclaim`, options);
    if (owner !== null) return owner;
    if (!(await reclaimOwnedFile(guardPath, `${lockName} reclaim`))) return null;
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    const handle = await open(path, "r");
    await handle.close();
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    if (errorCode(error) === "EISDIR") return true;
    throw error;
  }
};

const createLockOwner = async (lockPath: string): Promise<LockOwner> => {
  const owner = {
    incarnation: randomUUID(),
    pid: process.pid,
    token: randomUUID(),
  };
  const handle = await open(ownerPath(lockPath, owner.token), "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return owner;
};

const discardLockOwner = async (lockPath: string, owner: LockOwner): Promise<void> => {
  await rm(ownerPath(lockPath, owner.token), { force: true });
};

const tryAcquireOwnedFile = async (
  lockPath: string,
  lockName: string,
  options: AtomicDocumentFileOptions,
): Promise<LockOwner | null> => {
  const owner = await createLockOwner(lockPath);
  let acquired = false;
  try {
    await link(ownerPath(lockPath, owner.token), lockPath);
    acquired = true;
    await options.lockLinkedObserver?.(lockPath);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      if (acquired) await releaseLock(lockPath, lockName, owner);
      else await discardLockOwner(lockPath, owner);
      throw error;
    }
  }
  let current: LockOwner | null = null;
  try {
    current = await readLockOwner(lockPath, lockName);
  } catch (error) {
    if (errorCode(error) !== "EISDIR") {
      await discardLockOwner(lockPath, owner);
      throw error;
    }
  }
  const ownerMatches =
    current?.token === owner.token &&
    current.pid === owner.pid &&
    current.incarnation === owner.incarnation;
  if (!ownerMatches) await discardLockOwner(lockPath, owner);
  return acquired && ownerMatches ? owner : null;
};

const tryAcquireLock = async (
  lockPath: string,
  lockName: string,
  options: AtomicDocumentFileOptions,
): Promise<LockOwner | null> => {
  if (await pathExists(`${lockPath}.reclaim`)) return null;
  const owner = await tryAcquireOwnedFile(lockPath, lockName, options);
  if (owner === null) return null;
  if (!(await pathExists(`${lockPath}.reclaim`))) return owner;
  await releaseLock(lockPath, lockName, owner);
  return null;
};

const acquireLock = async (
  lockPath: string,
  lockName: string,
  options: AtomicDocumentFileOptions,
): Promise<LockOwner> => {
  const startedAt = monotonicNow();
  const retryMs = options.lockRetryMs ?? LOCK_RETRY_MS;
  const timeoutMs = options.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  for (;;) {
    const owner = await tryAcquireLock(lockPath, lockName, options);
    if (owner !== null) return owner;
    if (await reclaimDeadLock(lockPath, lockName, options)) continue;
    if (monotonicNow() - startedAt >= timeoutMs) {
      throw new Error(`Timed out acquiring ${lockName} lock: ${lockPath}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, retryMs));
  }
};

const syncDirectory = async (path: string, options: AtomicDocumentFileOptions): Promise<void> => {
  const handle = await open(path, "r");
  try {
    await handle.sync();
    await options.directorySyncObserver?.(path);
  } finally {
    await handle.close();
  }
};

const missingDirectoryAncestry = async (path: string): Promise<readonly string[]> => {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      const metadata = await stat(current);
      if (!metadata.isDirectory())
        throw new Error(`Atomic document parent is not a directory: ${current}`);
      break;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      missing.push(current);
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
  return missing.toReversed();
};

const createDirectoryDurably = async (
  directory: string,
  options: AtomicDocumentFileOptions,
): Promise<void> => {
  try {
    await mkdir(directory);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
    if (!(await stat(directory)).isDirectory()) throw error;
  }
  await syncDirectory(dirname(directory), options);
};

const ensureDirectoryDurable = async (
  path: string,
  options: AtomicDocumentFileOptions,
): Promise<void> => {
  for (const directory of await missingDirectoryAncestry(path)) {
    await createDirectoryDurably(directory, options);
  }
};

export const createAtomicDocumentFile = <Document>({
  decode,
  encode,
  filePath,
  lockName,
  options = {},
}: AtomicDocumentFileDefinition<Document>): AtomicDocumentFile<Document> => {
  const validatedOptions = validateOptions(options);
  let targetPromise: Promise<string> | undefined;
  const targetPath = (): Promise<string> => {
    targetPromise ??= canonicalDocumentTarget(filePath);
    return targetPromise;
  };
  const read = async (): Promise<Document | null> => {
    const target = await targetPath();
    await validateExistingTarget(target);
    try {
      return decode(JSON.parse(await readFile(target, "utf8")) as unknown);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  };
  const replace = async (document: Document): Promise<void> => {
    const target = await targetPath();
    await validateExistingTarget(target);
    const directory = dirname(target);
    await ensureDirectoryDurable(directory, validatedOptions);
    const temporary = join(directory, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(encode(document))}\n`, "utf8");
      await handle.sync();
      await validatedOptions.commitFault?.("after-file-sync");
      await handle.close();
      handle = undefined;
      await rename(temporary, target);
      await validatedOptions.commitFault?.("after-rename");
      await syncDirectory(directory, validatedOptions);
      await validatedOptions.commitFault?.("after-directory-sync");
    } finally {
      await handle?.close();
      await rm(temporary, { force: true });
    }
  };
  return {
    read,
    transact: async (transition) => {
      const target = await targetPath();
      const lockPath = `${target}.lock`;
      await ensureDirectoryDurable(dirname(target), validatedOptions);
      const owner = await acquireLock(lockPath, lockName, validatedOptions);
      try {
        await validateExistingTarget(target);
        const current = await read();
        const result = await transition(current);
        if (result.replacement !== null) await replace(result.replacement);
        return { document: result.replacement ?? current, value: result.value };
      } finally {
        await releaseLock(lockPath, lockName, owner);
      }
    },
  };
};
