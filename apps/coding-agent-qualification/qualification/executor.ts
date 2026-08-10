import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

interface QualificationExecution {
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly timeoutDiagnostic: string | null;
}

interface QualificationExecutorInput {
  readonly python: string;
  readonly probe: string;
  readonly lock: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const sandboxLiteral = (value: string): string =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const sandboxSubpath = (path: string): string => `(subpath ${sandboxLiteral(path)})`;

const sandboxProfile = (input: QualificationExecutorInput, root: string): string => {
  const realPython = realpathSync(input.python);
  const environmentRoot = dirname(dirname(input.python));
  const interpreterRoot = dirname(dirname(realPython));
  const readPaths = [
    environmentRoot,
    interpreterRoot,
    input.probe,
    input.lock,
    "/System",
    "/Library/Apple",
    "/usr",
    "/private/etc",
    "/private/var/db/timezone",
    "/dev/null",
    "/dev/urandom",
  ];
  const readableSubpaths = readPaths.map(sandboxSubpath).join(" ");
  return [
    "(version 1)",
    "(deny default)",
    "(allow file-read-metadata)",
    `(allow file-read* (literal "/") ${readableSubpaths})`,
    `(allow file-read* (subpath ${sandboxLiteral(root)}))`,
    `(allow file-write* (subpath ${sandboxLiteral(root)}) (literal "/dev/null"))`,
    `(allow process-exec (literal ${sandboxLiteral(input.python)}) (literal ${sandboxLiteral(realPython)}))`,
    "(allow process-fork)",
    "(allow process-info*)",
    "(allow signal (target self))",
    "(allow ipc-posix*)",
    "(allow system-socket)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow mach-register)",
    "(allow user-preference-read)",
    "(allow iokit-open)",
  ].join("\n");
};

export const executeOpenHandsQualification = async (
  input: QualificationExecutorInput,
): Promise<QualificationExecution> => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "llm-core-openhands-qualification-"));
  const home = join(root, "home");
  const temporary = join(root, "tmp");
  const qualification = join(root, "qualification");
  const deniedFile = `${root}-denied-read`;
  const deniedWrite = `${root}-denied-write`;
  mkdirSync(home);
  mkdirSync(temporary);
  mkdirSync(qualification);
  writeFileSync(deniedFile, "ambient credential sentinel", { mode: 0o600 });
  try {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const process = Bun.spawn(
      ["/usr/bin/sandbox-exec", "-p", sandboxProfile(input, root), input.python, input.probe],
      {
        cwd: qualification,
        env: {
          HOME: home,
          LANG: "C.UTF-8",
          LITELLM_LOCAL_MODEL_COST_MAP: "True",
          LLM_CORE_DENIED_FILE: deniedFile,
          LLM_CORE_DENIED_WRITE: deniedWrite,
          LLM_CORE_LOCK_PATH: input.lock,
          LLM_CORE_QUALIFICATION_ROOT: qualification,
          OPENHANDS_SUPPRESS_BANNER: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONNOUSERSITE: "1",
          TMPDIR: temporary,
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, timeoutMs);
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]).finally(() => clearTimeout(timeout));
    return Object.freeze({
      exitCode,
      signalCode: process.signalCode,
      stdout,
      stderr,
      timedOut,
      timeoutDiagnostic: timedOut
        ? `OpenHands qualification exceeded its ${timeoutMs} ms execution deadline.`
        : null,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
    rmSync(deniedFile, { force: true });
    rmSync(deniedWrite, { force: true });
  }
};
