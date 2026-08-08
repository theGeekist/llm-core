import importlib.metadata
import json

from openhands.sdk import Message, MessageEvent, TextContent


message = Message(role="user", content=[TextContent(text="characterise")])
event = MessageEvent(source="user", llm_message=message)
round_trip = MessageEvent.model_validate_json(event.model_dump_json())

assert importlib.metadata.version("openhands-sdk") == "1.37.1"
assert round_trip.llm_message.content[0].text == "characterise"

print(json.dumps({
    "upstream": "OpenHands Software Agent SDK",
    "version": "1.37.1",
    "observations": [
        {"operationId": "native.message-event-round-trip", "outcome": "observed-supported"},
    ],
}, sort_keys=True))
