// #region docs
import { fromAiSdkModel } from "#adapters";
import { type Model } from "#adapters";
import { anthropic } from "@ai-sdk/anthropic";

// The 'driver' for your workflow
const model: Model = fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"));
// #endregion docs

void model;
