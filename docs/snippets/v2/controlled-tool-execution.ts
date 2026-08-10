import {
  executeControlledTool,
  type ExecuteControlledToolInput,
} from "@geekist/llm-core/tools/runtime";

declare const input: ExecuteControlledToolInput;

const outcome = await executeControlledTool(input);

switch (outcome.status) {
  case "succeeded":
  case "failed":
    console.log(outcome.receipt.state, outcome.result.status);
    break;
  case "conflict":
    console.log(outcome.existingReceiptId);
    break;
  default:
    console.log(outcome.receipt.state);
}
