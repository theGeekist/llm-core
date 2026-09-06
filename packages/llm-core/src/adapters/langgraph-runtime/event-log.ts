export class LangGraphEventLog<TEvent> {
  readonly #events: TEvent[] = [];
  readonly #waiters = new Set<() => void>();
  #closed = false;

  append(event: TEvent): void {
    if (this.#closed) return;
    this.#events.push(event);
    this.#wake();
  }

  close(): void {
    this.#closed = true;
    this.#wake();
  }

  stream(): AsyncIterable<TEvent> {
    const events = this.#events;
    const waiters = this.#waiters;
    const closed = () => this.#closed;
    return {
      async *[Symbol.asyncIterator]() {
        let index = 0;
        while (true) {
          while (index < events.length) yield events[index++]!;
          if (closed()) return;
          await new Promise<void>((resolve) => waiters.add(resolve));
        }
      },
    };
  }

  #wake(): void {
    for (const wake of this.#waiters) wake();
    this.#waiters.clear();
  }
}
