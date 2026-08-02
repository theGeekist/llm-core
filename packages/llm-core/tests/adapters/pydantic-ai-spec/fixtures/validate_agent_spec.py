#!/usr/bin/env python3
"""Validate the immutable fixture with the exact qualified PydanticAI release."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pydantic_ai
from pydantic_ai import AgentSpec


if pydantic_ai.__version__ != "2.19.0":
    raise RuntimeError(f"expected pydantic-ai 2.19.0, got {pydantic_ai.__version__}")

fixture = Path(sys.argv[1])
spec = AgentSpec.from_file(fixture, fmt="json")
serialization_context = {"use_short_form": True}
serialized = spec.model_dump(
    mode="json",
    exclude_defaults=True,
    context=serialization_context,
)
roundtrip = AgentSpec.from_dict(serialized).model_dump(
    mode="json",
    exclude_defaults=True,
    context=serialization_context,
)
if roundtrip != serialized:
    raise RuntimeError("AgentSpec did not preserve the qualified short-form roundtrip")
print(json.dumps(roundtrip, sort_keys=True))
