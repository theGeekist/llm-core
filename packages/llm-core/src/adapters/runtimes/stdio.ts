import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  PydanticAiBridgeRequest,
  PydanticAiBridgeResponse,
  PydanticAiBridgeTransport,
} from "./pydantic-ai";

export interface NdjsonStdioTransportOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export interface ClosablePydanticAiBridgeTransport extends PydanticAiBridgeTransport {
  close(): Promise<void>;
}

interface PendingExchange {
  resolve(value: PydanticAiBridgeResponse): void;
  reject(reason: Error): void;
}

const writeRequest = (
  child: ChildProcessWithoutNullStreams,
  pending: PendingExchange[],
  request: PydanticAiBridgeRequest,
): Promise<PydanticAiBridgeResponse> =>
  new Promise<PydanticAiBridgeResponse>((resolve, reject) => {
    pending.push({ resolve, reject });
    child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
      if (error) {
        pending.pop();
        reject(error);
      }
    });
  });

/**
 * Serialized NDJSON process transport. It intentionally has no provider or
 * PydanticAI knowledge; compatibility is established by the bridge handshake.
 */
export const createNdjsonStdioTransport = (
  options: NdjsonStdioTransportOptions,
): ClosablePydanticAiBridgeTransport => {
  const child: ChildProcessWithoutNullStreams = spawn(options.command, [...options.args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending: PendingExchange[] = [];
  let stderr = "";
  let closed = false;
  let tail = Promise.resolve();

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4096);
  });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const waiter = pending.shift();
    if (!waiter) {
      return;
    }
    try {
      waiter.resolve(JSON.parse(line) as PydanticAiBridgeResponse);
    } catch {
      waiter.reject(new Error("Python bridge emitted malformed NDJSON."));
    }
  });

  const processFailure = (message: string): void => {
    closed = true;
    const detail = stderr ? ` ${stderr}` : "";
    for (const waiter of pending.splice(0)) {
      waiter.reject(new Error(`${message}${detail}`));
    }
  };
  child.once("error", (error) => processFailure(`Python bridge failed: ${error.message}`));
  child.once("exit", (code) => {
    if (code !== 0) {
      processFailure(`Python bridge exited with code ${String(code)}.`);
    } else {
      processFailure("Python bridge closed.");
    }
  });

  const exchange = (request: PydanticAiBridgeRequest): Promise<PydanticAiBridgeResponse> => {
    const operation = async (): Promise<PydanticAiBridgeResponse> => {
      if (closed || !child.stdin.writable) {
        throw new Error("Python bridge transport is closed.");
      }
      return writeRequest(child, pending, request);
    };
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    exchange,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      lines.close();
      child.stdin.end();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
      });
    },
  };
};
