#!/usr/bin/env python3
"""Deterministic llm-core/PydanticAI v2 bridge reference.

This process proves the NDJSON/Python boundary even when ``pydantic_ai`` is not
installed. Its handshake reports package availability truthfully; the
TypeScript PydanticAI runner fails closed when the optional package is absent.
The transport-only conformance runner may still exercise this stdlib lifecycle.
"""

from __future__ import annotations

import importlib
import json
import secrets
import sys
import time
import uuid
from typing import Any

PROTOCOL = "llm-core.pydantic-ai.bridge/v1"
SEMANTICS = [
    {
        "area": "model",
        "semantic": "text-messages",
        "disposition": "supported",
        "detail": "Text prompts and responses retain their meaning.",
    },
    {
        "area": "model",
        "semantic": "python-output-type",
        "disposition": "projected",
        "detail": "Typed Python output has no direct cross-language type identity.",
    },
    {
        "area": "model",
        "semantic": "cross-language-json-output",
        "disposition": "projected",
        "detail": "AgentSpec output_schema is instruction-only; the bridge must validate JSON independently.",
    },
    {
        "area": "model",
        "semantic": "binary-media-reasoning-and-native-extensions",
        "disposition": "unsupported",
        "detail": "No portable v1 bridge representation is declared for these provider-sensitive values.",
    },
    {
        "area": "tool",
        "semantic": "function-tool-schema-call-id-arguments-and-result",
        "disposition": "supported",
        "detail": "Allowlisted process-local tools retain schema, call identity, JSON arguments and results.",
    },
    {
        "area": "control",
        "semantic": "read-only-tool-execution",
        "disposition": "supported",
        "detail": "Read-only tools may execute after Python-side validation.",
    },
    {
        "area": "control",
        "semantic": "meaningful-effects-and-approval-authority",
        "disposition": "unsupported",
        "detail": "Deferred PydanticAI calls are not llm-core authorization or durable effect receipts.",
    },
    {
        "area": "event",
        "semantic": "ordered-agent-lifecycle",
        "disposition": "projected",
        "detail": "Normalized lifecycle events are projected; provider event variants are not preserved.",
    },
    {
        "area": "state",
        "semantic": "caller-managed-message-history",
        "disposition": "projected",
        "detail": "Serializable history is observational state, not a resumable llm-core checkpoint.",
    },
    {
        "area": "state",
        "semantic": "registered-checkpoint-and-recorded-effects",
        "disposition": "unsupported",
        "detail": "PydanticAI local runs do not provide llm-core checkpoint compatibility or effect receipts.",
    },
    {
        "area": "continuation",
        "semantic": "provider-session-live-or-durable-continuation",
        "disposition": "unsupported",
        "detail": "A new run with message history is not provider-session, live, or durable continuation.",
    },
]
NOW = "2026-07-30T00:00:00.000Z"
prepared: dict[str, dict[str, Any]] = {}
runs: dict[str, dict[str, Any]] = {}


def uuid7() -> str:
    """Create a fresh RFC 9562 UUIDv7 on every supported Python version."""
    timestamp_ms = time.time_ns() // 1_000_000
    value = (
        (timestamp_ms & ((1 << 48) - 1)) << 80
        | (0x7 << 76)
        | (secrets.randbits(12) << 64)
        | (0b10 << 62)
        | secrets.randbits(62)
    )
    return str(uuid.UUID(int=value))


def pydantic_ai_version() -> tuple[bool, str]:
    try:
        module = importlib.import_module("pydantic_ai")
        return True, str(module.__version__)
    except (ImportError, AttributeError):
        return False, "not-installed"


def execute_pydantic_ai(prompt: str, instructions: str) -> dict[str, Any]:
    """Exercise the assessed public Agent/TestModel/tool surface when installed."""
    from pydantic_ai import Agent, AgentSpec
    from pydantic_ai.models.test import TestModel

    model = TestModel()
    projected_spec = AgentSpec.from_dict({"instructions": instructions})
    agent = Agent.from_spec(projected_spec, model=model)

    @agent.tool_plain
    def echo(value: str) -> str:
        """Return a deterministic portable tool result."""
        return value

    result = agent.run_sync(prompt)
    parameters = model.last_model_request_parameters
    tool_names = (
        [tool.name for tool in parameters.function_tools]
        if parameters is not None
        else []
    )
    messages = json.loads(result.all_messages_json())
    tool_call: dict[str, Any] | None = None
    tool_return: dict[str, Any] | None = None
    for message in messages:
        for part in message.get("parts", []):
            if part.get("part_kind") == "tool-call":
                tool_call = part
            elif part.get("part_kind") == "tool-return":
                tool_return = part
    return {
        "output": str(result.output),
        "toolNames": tool_names,
        "messages": messages,
        "toolCall": tool_call,
        "toolReturn": tool_return,
    }


def response(operation: str, payload: Any = None, error: Any = None) -> dict[str, Any]:
    value: dict[str, Any] = {
        "protocol": PROTOCOL,
        "operation": operation,
        "ok": error is None,
    }
    if error is None:
        value["payload"] = payload
    else:
        value["error"] = error
    return value


def event(run_id: str, sequence: int, kind: str, facts: dict[str, Any]) -> dict[str, Any]:
    return {
        "eventId": uuid7(),
        "kind": kind,
        "occurredAt": NOW,
        "sequence": sequence,
        "identity": {"runId": run_id},
        "facts": facts,
    }


def handle(request: dict[str, Any]) -> dict[str, Any]:
    operation = request.get("operation", "")
    if request.get("protocol") != PROTOCOL:
        return response(operation, error={"code": "protocol-mismatch", "message": "Unsupported protocol."})
    payload = request.get("payload") or {}
    if operation == "handshake":
        available, version = pydantic_ai_version()
        return response(
            operation,
            {
                "protocol": PROTOCOL,
                "pythonVersion": ".".join(map(str, sys.version_info[:3])),
                "pydanticAiVersion": version,
                "pydanticAiAvailable": available,
                "semantics": SEMANTICS,
            },
        )
    if operation == "prepare":
        spec = payload.get("spec")
        allowed_spec_keys = {
            "agentId",
            "version",
            "instructions",
            "effectRequirement",
        }
        if (
            not isinstance(spec, dict)
            or set(spec) != allowed_spec_keys
            or spec.get("effectRequirement") != "read-only"
            or not isinstance(spec.get("instructions"), str)
            or "{{" in spec["instructions"]
            or "}}" in spec["instructions"]
        ):
            return response(
                operation,
                error={
                    "code": "unsupported-agent-spec",
                    "message": "Only closed, literal, read-only agent specs are supported.",
                },
            )
        token = str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(spec, sort_keys=True)))
        prepared[token] = spec
        return response(operation, {"token": token})
    if operation == "start":
        token = payload.get("token")
        if token not in prepared:
            return response(operation, error={"code": "unknown-token", "message": "Unknown prepared spec."})
        run_input = payload.get("input")
        if (
            not isinstance(run_input, dict)
            or set(run_input) != {"prompt"}
            or not isinstance(run_input["prompt"], str)
            or not run_input["prompt"]
        ):
            return response(
                operation,
                error={
                    "code": "unsupported-input",
                    "message": "Only a non-empty prompt string is supported.",
                },
            )
        run_id = uuid7()
        available, _version = pydantic_ai_version()
        runtime_result = (
            execute_pydantic_ai(
                json.dumps(payload.get("input"), sort_keys=True),
                str(prepared[token]["instructions"]),
            )
            if available
            else None
        )
        if runtime_result:
            tool_call = runtime_result["toolCall"] or {}
            tool_return = runtime_result["toolReturn"] or {}
            output = {
                "runtime": "pydantic-ai",
                "model": {"kind": "text", "text": runtime_result["output"]},
                "tool": {
                    "name": tool_call.get("tool_name"),
                    "toolCallId": tool_call.get("tool_call_id"),
                    "arguments": tool_call.get("args"),
                    "result": tool_return.get("content"),
                    "registered": "echo" in runtime_result["toolNames"],
                },
                "messageHistory": runtime_result["messages"],
            }
        else:
            output = {
                "runtime": "python-transport",
                "model": {"kind": "text", "text": "deterministic"},
            }
        runs[run_id] = {
            "events": [
                event(
                    run_id,
                    0,
                    "agent.run.started",
                    {
                        "agentId": prepared[token]["agentId"],
                        "agentVersion": prepared[token]["version"],
                    },
                ),
                event(run_id, 1, "agent.run.progress", {"code": "python.model.completed"}),
                event(run_id, 2, "agent.run.progress", {"code": "python.tool.completed"}),
                event(run_id, 3, "agent.run.completed", {"status": "completed"}),
            ],
            "result": {"identity": {"runId": run_id}, "status": "completed", "output": output},
        }
        return response(operation, {"runId": run_id})
    run_id = payload.get("runId")
    run = runs.get(run_id)
    if run is None:
        return response(operation, error={"code": "unknown-run", "message": "Unknown run."})
    if operation == "events":
        return response(operation, run["events"])
    if operation == "result":
        return response(operation, run["result"])
    if operation == "cancel":
        return response(operation, {"status": "already-terminal", "acknowledgedAt": NOW})
    if operation == "intervene":
        return response(operation, {"status": "unsupported", "acknowledgedAt": NOW})
    return response(operation, error={"code": "unknown-operation", "message": "Unknown operation."})


for raw_line in sys.stdin:
    try:
        command = json.loads(raw_line)
        print(json.dumps(handle(command), separators=(",", ":")), flush=True)
    except Exception as exc:  # Fail closed without exposing stack/provider internals.
        print(
            json.dumps(
                response("unknown", error={"code": "bridge-error", "message": type(exc).__name__}),
                separators=(",", ":"),
            ),
            flush=True,
        )
