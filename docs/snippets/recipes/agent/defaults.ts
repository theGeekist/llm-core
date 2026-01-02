// #region docs
import { recipes } from "#recipes";
import type { AgentRecipeConfig } from "#recipes";
import type { AdapterBundle } from "#adapters";
const myMemoryAdapter = {} as AdapterBundle["memory"];

const config = {
  tools: {
    defaults: {
      adapters: {
        tools: [
          /* tool adapters */
        ],
      },
    },
  },
  memory: {
    defaults: {
      adapters: {
        memory: myMemoryAdapter,
      },
    },
  },
} satisfies AgentRecipeConfig;

const agent = recipes.agent().configure(config);

// #endregion docs
void agent;
