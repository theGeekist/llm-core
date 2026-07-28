import { describe, expect, it } from "bun:test";
import type { Model, ModelCall } from "#adapters";
import { attachAdapterContext, createAdapterContext } from "#workflow/adapter-context";

describe("Workflow adapter context receivers", () => {
  it("preserves class adapter method receivers", async () => {
    class StatefulModel implements Model {
      readonly #prefix = "stateful";

      generate(_call: ModelCall) {
        return { text: `${this.#prefix}-result` };
      }
    }

    class StatefulOutputParser {
      readonly #format = "stateful-format";

      parse(input: string) {
        return input;
      }

      formatInstructions() {
        return this.#format;
      }
    }

    const { context } = createAdapterContext();
    const wrapped = attachAdapterContext(
      {
        model: new StatefulModel(),
        outputParser: new StatefulOutputParser(),
      },
      context,
    );

    expect(await wrapped.model?.generate({ prompt: "hello" })).toEqual({
      text: "stateful-result",
    });
    expect(wrapped.outputParser?.formatInstructions?.()).toBe("stateful-format");
  });

  it("preserves object-literal adapter method receivers", async () => {
    const { context } = createAdapterContext();
    const wrapped = attachAdapterContext(
      {
        model: {
          prefix: "literal",
          generate() {
            return { text: `${this.prefix}-result` };
          },
        } as Model & { prefix: string },
      },
      context,
    );

    expect(await wrapped.model?.generate({ prompt: "hello" })).toEqual({
      text: "literal-result",
    });
  });
});
