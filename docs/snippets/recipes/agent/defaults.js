// #region docs
import { recipes } from "#recipes";
// #endregion docs

/** @type {any} */
const myMemoryAdapter = {};

// #region docs
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
