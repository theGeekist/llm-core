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

PROTOCOL = "llm-core.pydantic-ai.bridge/v2"
PYDANTIC_AI_VERSION = "2.19.0"
PYDANTIC_AI_COMMIT = "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5"
PORTABLE_CONTRACT = {
    "authority": "@geekist/llm-core AgentRunner",
    "version": "2",
    "source": "packages/llm-core/src/features/agent/public.ts",
}
NATIVE_CONTRACT = {
    "authority": "pydantic-ai-slim",
    "version": PYDANTIC_AI_VERSION,
    "source": PYDANTIC_AI_COMMIT,
}
SUPPORTED_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#supported-exact-operations"
DEFINITION_REJECTION_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-definition-and-input-operations"
RESULT_REJECTION_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-result-operations"
CONTROL_REJECTION_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-control-and-continuation-operations"
TYPED_OUTPUT_REJECTION_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-typed-output-operation"
NATIVE_EVENTS_REJECTION_FIXTURE = "packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts#unsupported-native-event-stream-operation"


def operation(
    area: str,
    operation_id: str,
    surface: str,
    owner: str,
    contract: dict[str, str],
    disposition: str,
    fixtures: list[str],
    detail: str,
) -> dict[str, Any]:
    return {
        "area": area,
        "operation": operation_id,
        "surface": surface,
        "owner": owner,
        "contract": contract,
        "disposition": disposition,
        "fixtures": fixtures,
        "detail": detail,
    }


OPERATIONS = [
    operation("model", "portable.agent.prepare.literal-read-only-definition", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "A closed literal AgentDefinition is prepared without dropping fields."),
    operation("model", "portable.agent.start.text-prompt", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "A non-empty text prompt is passed literally to the assessed runtime."),
    operation("model", "portable.agent.result.text", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "The assessed text result is returned as an explicit portable text value."),
    operation("tool", "native.pydantic-ai.testmodel.echo-string-tool-trajectory", "native", "pydantic-ai", NATIVE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "The assessed TestModel trajectory preserves one echo tool call with one string value argument and matching return."),
    operation("control", "portable.tool.execute.read-only-allowlisted", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [DEFINITION_REJECTION_FIXTURE], "The bridge does not accept a caller-declared portable tool binding."),
    operation("event", "portable.agent.observe.normalized-lifecycle", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "Adapter-owned lifecycle events satisfy the closed AgentEvent sequence contract."),
    operation("state", "native.pydantic-ai.testmodel.echo-four-message-history-json", "native", "pydantic-ai", NATIVE_CONTRACT, "supported", [SUPPORTED_FIXTURE], "The assessed TestModel prompt, echo call, echo return and final text history is retained exactly."),
    operation("model", "native.pydantic-ai.typed-output", "native", "pydantic-ai", NATIVE_CONTRACT, "unsupported", [TYPED_OUTPUT_REJECTION_FIXTURE], "The bridge explicitly rejects native output_type requests."),
    operation("model", "portable.agent.result.structured-json", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [RESULT_REJECTION_FIXTURE], "No exact portable output-schema validation operation is implemented."),
    operation("model", "native.pydantic-ai.binary-media-reasoning-provider-extensions", "native", "pydantic-ai", NATIVE_CONTRACT, "unsupported", [DEFINITION_REJECTION_FIXTURE, RESULT_REJECTION_FIXTURE], "The bridge rejects these PydanticAI and provider-native values."),
    operation("event", "native.pydantic-ai.event-stream", "native", "pydantic-ai", NATIVE_CONTRACT, "unsupported", [NATIVE_EVENTS_REJECTION_FIXTURE], "The bridge explicitly rejects requests for PydanticAI native event streaming."),
    operation("state", "native.pydantic-ai.dependencies-and-provider-state", "native", "pydantic-ai", NATIVE_CONTRACT, "unsupported", [DEFINITION_REJECTION_FIXTURE, RESULT_REJECTION_FIXTURE], "Dependencies and provider state remain PydanticAI-owned and are not exposed by the bridge."),
    operation("control", "portable.agent.cancel", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [CONTROL_REJECTION_FIXTURE], "The bounded process has no live in-flight cancellation channel."),
    operation("control", "portable.agent.intervene", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [CONTROL_REJECTION_FIXTURE], "PydanticAI deferred calls are not llm-core authenticated interventions."),
    operation("state", "portable.agent.resume.checkpoint", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [CONTROL_REJECTION_FIXTURE], "PydanticAI message history is not an llm-core checkpoint."),
    operation("continuation", "portable.agent.continue.provider-session", "portable", "@geekist/llm-core", PORTABLE_CONTRACT, "unsupported", [CONTROL_REJECTION_FIXTURE], "A new run with history is not provider-session, live or durable continuation."),
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
    native_spec = AgentSpec.from_dict({"instructions": instructions})
    agent = Agent.from_spec(native_spec, model=model)

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
    return {
        "output": str(result.output),
        "toolNames": tool_names,
        "messages": messages,
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
                "operations": OPERATIONS,
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
                run_input["prompt"],
                str(prepared[token]["instructions"]),
            )
            if available
            else None
        )
        if runtime_result:
            output = {"kind": "text", "text": runtime_result["output"]}
            native_result = {
                "runtime": "pydantic-ai",
                "runtimeVersion": PYDANTIC_AI_VERSION,
                "native": {
                    "output": runtime_result["output"],
                    "toolNames": runtime_result["toolNames"],
                    "messageHistory": runtime_result["messages"],
                },
            }
        else:
            output = {"kind": "text", "text": "deterministic"}
            native_result = None
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
            "nativeResult": native_result,
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
    if operation == "native-result":
        if run["nativeResult"] is None:
            return response(
                operation,
                error={
                    "code": "native-result-unavailable",
                    "message": "The PydanticAI native result is unavailable.",
                },
            )
        return response(
            operation,
            {
                "identity": {"runId": run_id},
                "observation": run["nativeResult"],
            },
        )
    if operation == "native-typed-output":
        return response(
            operation,
            error={
                "code": "native-typed-output-unsupported",
                "message": "PydanticAI output_type is not supported by this bridge.",
            },
        )
    if operation == "native-events":
        return response(
            operation,
            error={
                "code": "native-event-stream-unsupported",
                "message": "PydanticAI native event streaming is not supported by this bridge.",
            },
        )
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
