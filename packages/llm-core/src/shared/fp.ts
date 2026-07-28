export const toNull = () => null;
export const toUndefined = () => undefined; // strongly discouraged. Only used for interop adapters
export const toTrue = () => true;
export const toFalse = () => false;

export const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

export type Unary<TIn, TOut> = (value: TIn) => TOut;

const applyCompose = (fns: readonly Unary<unknown, unknown>[], value: unknown) => {
  let result = value;
  for (let index = fns.length - 1; index >= 0; index -= 1) {
    const fn = fns[index];
    if (!fn) continue;

    result = fn(result);
  }
  return result;
};

export function compose<TIn, TOut>(fn: Unary<TIn, TOut>): (value: TIn) => TOut;
export function compose<TIn, TMid, TOut>(
  fn1: Unary<TMid, TOut>,
  fn2: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose<TIn, TMid, TMid2, TOut>(
  fn1: Unary<TMid2, TOut>,
  fn2: Unary<TMid, TMid2>,
  fn3: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose<TIn, TMid, TMid2, TMid3, TOut>(
  fn1: Unary<TMid3, TOut>,
  fn2: Unary<TMid2, TMid3>,
  fn3: Unary<TMid, TMid2>,
  fn4: Unary<TIn, TMid>,
): (value: TIn) => TOut;
export function compose(...fns: Array<Unary<unknown, unknown>>) {
  return bindFirst(applyCompose, fns);
}

export const bindFirst =
  <TFirst, TRest extends unknown[], TResult>(
    fn: (first: TFirst, ...rest: TRest) => TResult,
    first: TFirst,
  ) =>
  (...rest: TRest) =>
    fn(first, ...rest);
