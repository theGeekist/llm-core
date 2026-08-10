import difflib
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import socket
from pathlib import Path

from openhands.sdk import LocalWorkspace, Message, MessageEvent, TextContent


VERSION = "1.37.1"
REVISION = "310989d306114efd0fcadbcbed9ff9c21d4a5963"
RELATIVE_PATH = "src/message.txt"
BEFORE = "qualification pending\n"
AFTER = "qualification complete\n"


def native_event(source: str, role: str, text: str) -> str:
    message = Message(role=role, content=[TextContent(text=text)])
    event = MessageEvent(source=source, llm_message=message)
    serialized = event.model_dump_json()
    round_trip = MessageEvent.model_validate_json(serialized)
    assert round_trip.source == source
    assert round_trip.llm_message.role == role
    assert round_trip.llm_message.content[0].text == text
    return serialized


assert importlib.metadata.version("openhands-sdk") == VERSION

credential_names = {
    "ANTHROPIC_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "GITHUB_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "OPENAI_API_KEY",
}
assert credential_names.isdisjoint(os.environ)

root = Path(os.environ["LLM_CORE_QUALIFICATION_ROOT"]).resolve()
workspace_root = root / "workspace"
staging_root = root / "staging"
workspace_root.mkdir(parents=True)
staging_root.mkdir()
before_source = staging_root / "before.txt"
after_source = staging_root / "after.txt"
before_source.write_text(BEFORE, encoding="utf-8")
after_source.write_text(AFTER, encoding="utf-8")

workspace = LocalWorkspace(working_dir=workspace_root)
target = workspace_root / RELATIVE_PATH
before_download = staging_root / "observed-before.txt"
after_download = staging_root / "observed-after.txt"
assert workspace.file_upload(before_source, target).success
assert workspace.file_download(target, before_download).success
observed_before = before_download.read_text(encoding="utf-8")
assert workspace.file_upload(after_source, target).success
assert workspace.file_download(target, after_download).success
observed_after = after_download.read_text(encoding="utf-8")


def permission_denied(operation) -> bool:
    try:
        operation()
    except PermissionError:
        return True
    return False


denied_file_read = permission_denied(
    lambda: Path(os.environ["LLM_CORE_DENIED_FILE"]).read_text(encoding="utf-8")
)
denied_file_write = permission_denied(
    lambda: Path(os.environ["LLM_CORE_DENIED_WRITE"]).write_text("denied", encoding="utf-8")
)


def connect_localhost() -> None:
    with socket.socket() as client:
        client.settimeout(0.2)
        client.connect(("127.0.0.1", 9))


denied_network = permission_denied(connect_localhost)
assert denied_file_read and denied_file_write and denied_network

installed = sorted(
    re.sub(r"[-_.]+", "-", distribution.metadata.get("Name") or "").lower()
    + "=="
    + distribution.version
    for distribution in importlib.metadata.distributions()
)
installed_closure = "\n".join(installed) + "\n"


def file_digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

patch = "\n".join(
    difflib.unified_diff(
        observed_before.splitlines(),
        observed_after.splitlines(),
        fromfile=f"a/{RELATIVE_PATH}",
        tofile=f"b/{RELATIVE_PATH}",
        lineterm="",
    )
) + "\n"

observation = {
    "schemaVersion": "1.0.0",
    "upstream": {
        "name": "OpenHands Software Agent SDK",
        "version": VERSION,
        "revision": REVISION,
    },
    "fixture": {
        "fixtureId": "governed-repository-change-v1",
        "workspaceKind": "openhands-local",
        "relativePath": RELATIVE_PATH,
        "before": observed_before,
        "after": observed_after,
        "patch": patch,
    },
    "permissions": {
        "filesystem": ["workspace.read", "workspace.write"],
        "process": ["python"],
        "network": [],
        "effects": ["repository.write"],
    },
    "nativeEvents": [
        {
            "sequence": 0,
            "nativeType": "MessageEvent",
            "source": "user",
            "serialized": native_event("user", "user", "Apply the governed repository change."),
        },
        {
            "sequence": 1,
            "nativeType": "MessageEvent",
            "source": "agent",
            "serialized": native_event("agent", "assistant", "The governed repository change is ready."),
        },
    ],
    "executableClosure": {
        "lockDigest": file_digest(Path(os.environ["LLM_CORE_LOCK_PATH"])),
        "probeDigest": file_digest(Path(__file__)),
        "installedClosureDigest": "sha256:"
        + hashlib.sha256(installed_closure.encode("utf-8")).hexdigest(),
        "installedPackageCount": len(installed),
        "interpreter": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
        },
        "platform": {
            "system": platform.system(),
            "architecture": platform.machine(),
        },
    },
    "sandbox": {
        "executor": "macos-sandbox-exec",
        "ambientEnvironmentInherited": False,
        "credentialEnvironmentAbsent": True,
        "deniedFileReadObserved": denied_file_read,
        "deniedFileWriteObserved": denied_file_write,
        "deniedNetworkObserved": denied_network,
    },
}

print(json.dumps(observation, separators=(",", ":"), sort_keys=True))
