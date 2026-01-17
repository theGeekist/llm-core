// #region docs
import type { SessionPolicy } from "#interaction";

const policy: SessionPolicy = {
  // Merge: combine previous history with new state
  merge: (previous, next) => ({
    ...next,
    messages: [...(previous?.messages ?? []), ...next.messages],
  }),

  // Truncate: limit the stored history
  truncate: (state) => {
    if (state.messages.length > 50) {
      return {
        ...state,
        messages: state.messages.slice(-50),
      };
    }
    return state;
  },
};
// #endregion docs
void policy;
