import { fromAiSdkModel } from "#adapters";
import { anthropic } from "@ai-sdk/anthropic";

// The 'driver' for your workflow
const model = fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"));

void model;
