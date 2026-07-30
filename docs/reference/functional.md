# Functional helpers

The `/functional` subpath provides small composition helpers that preserve
synchronous results. A callback returns `T` when all inputs are synchronous and
`Promise<T>` only when an input or callback is asynchronous. This lets ports
implement `MaybePromise<T>` without forcing every caller onto a promise path.

## MaybePromise composition

| Export          | Purpose                                                               |
| --------------- | --------------------------------------------------------------------- |
| `isPromiseLike` | Detect a promise-compatible result                                    |
| `maybeMap`      | Transform a value or fulfilled promise                                |
| `maybeChain`    | Sequence a callback that can itself return `MaybePromise`             |
| `maybeMapOr`    | Map a present value and provide a fallback for `null` or `undefined`  |
| `maybeTap`      | Run a sync-or-async side operation while retaining the original value |
| `maybeTry`      | Recover from sync throws and rejected promises through one handler    |
| `maybeAll`      | Collect values, returning synchronously when none are promises        |

`MaybePromise<T>` names the value-or-promise contract. Use these helpers at port
boundaries where implementations may be local or remote. Use ordinary language
constructs when an operation is always synchronous or always asynchronous.

## Steps and iteration

`maybeToStep` converts a value, promise, iterable, or async iterable into a
`MaybeAsyncIterable`. `collectStep` consumes that step into an array while
preserving a synchronous return for synchronous inputs.

## Function composition

| Export        | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `compose`     | Apply unary functions from right to left                       |
| `bindFirst`   | Bind the first argument of a function                          |
| `toUndefined` | Convert a callback result to `undefined` without changing flow |

The subpath intentionally stays small. It does not export `maybeReduce`,
general async-iterable adapters, or application orchestration.
