import importlib.metadata
import json

from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel


agent = Agent(TestModel())
result = agent.run_sync("characterise")

assert importlib.metadata.version("pydantic-ai") == "2.19.0"
assert result.output == "success (no tool calls)"

print(json.dumps({
    "upstream": "PydanticAI",
    "version": "2.19.0",
    "observations": [
        {"operationId": "native.typed-agent-run", "outcome": "observed-supported"},
    ],
}, sort_keys=True))
