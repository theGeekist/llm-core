import {
  redactedNativeExtensions,
  type EventSink,
  type ToolReceiptJournal,
} from "@aifsd/llm-core/evidence";

const extensions = redactedNativeExtensions({
  "com.example.provider": {
    requestId: "request_123",
    authorization: "[redacted]",
  },
});

declare const events: EventSink;
declare const receipts: ToolReceiptJournal;

void extensions;
void events;
void receipts;
