export class AsyncEventLog<TEvent> {
  readonly #events: TEvent[] = [];
  readonly #waiters = new Set<() => void>();
  #closed = false;
  #error: unknown;
  #hasError = false;

  append(event: TEvent): void {
    if (this.#closed) {
      return;
    }
    this.#events.push(event);
    this.#wake();
  }

  close(...failure: [] | [unknown]): void {
    if (failure.length === 1) {
      this.#error = failure[0];
      this.#hasError = true;
    }
    this.#closed = true;
    this.#wake();
  }

  stream(): AsyncIterable<TEvent> {
    const events = this.#events;
    const waiters = this.#waiters;
    const closed = () => this.#closed;
    const failure = () => ({ hasError: this.#hasError, error: this.#error });
    return {
      async *[Symbol.asyncIterator]() {
        let index = 0;
        while (true) {
          while (index < events.length) {
            yield events[index++]!;
          }
          if (closed()) {
            const terminal = failure();
            if (terminal.hasError) {
              throw terminal.error;
            }
            return;
          }
          await new Promise<void>((resolve) => waiters.add(resolve));
        }
      },
    };
  }

  #wake(): void {
    for (const wake of this.#waiters) {
      wake();
    }
    this.#waiters.clear();
  }
}
