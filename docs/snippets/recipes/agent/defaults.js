// #region docs
import { recipes } from "#recipes";
/** @type {any} */
const myMemoryAdapter = {};

const agent = recipes.agent().configure({
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
});

// #endregion docs
void agent;
