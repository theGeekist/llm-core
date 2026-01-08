import http from "node:http";
import { createInteractionSession } from "@geekist/llm-core/interaction";
import { createBuiltinModel } from "@geekist/llm-core/adapters";
import { bindFirst } from "@geekist/llm-core";

const PORT = 3030;
const store = new MemorySessionStore();

const server = http.createServer(handleRequest);
server.listen(PORT, onServerListening);

function onServerListening() {
  console.log(`interaction demo listening on http://localhost:${PORT}`);
}

function handleRequest(req, res) {
  const request = parseRequest({ req });
  if (!request) {
    return sendNotFound({ res });
  }

  if (request.pathname === "/") {
    return sendHtml({ res, html: CLIENT_HTML });
  }

  if (request.pathname === "/chat") {
    return handleChatRequest({ res, message: request.message, sessionId: request.sessionId });
  }

  return sendNotFound({ res });
}

function handleChatRequest(input) {
  initSseResponse({ res: input.res });
  const eventStream = createNodeSseEventStream({ res: input.res });
  const session = createInteractionSession({
    sessionId: input.sessionId,
    store,
    adapters: { model: createBuiltinModel() },
    eventStream,
  });

  const outcome = session.send({ role: "user", content: input.message });
  return finalizeResponse({ res: input.res, outcome });
}

function parseRequest(input) {
  const url = input.req.url;
  if (!url) {
    return null;
  }
  const parsed = new URL(url, `http://localhost:${PORT}`);
  return {
    pathname: parsed.pathname,
    message: parsed.searchParams.get("message") ?? "Hello from llm-core",
    sessionId: parsed.searchParams.get("sessionId") ?? "local-session",
  };
}

function sendNotFound(input) {
  input.res.statusCode = 404;
  input.res.end("Not found");
  return true;
}

function sendHtml(input) {
  input.res.statusCode = 200;
  input.res.setHeader("content-type", "text/html; charset=utf-8");
  input.res.end(input.html);
  return true;
}

function initSseResponse(input) {
  input.res.statusCode = 200;
  input.res.setHeader("content-type", "text/event-stream");
  input.res.setHeader("cache-control", "no-cache");
  input.res.setHeader("connection", "keep-alive");
  return true;
}

function finalizeResponse(input) {
  const onSuccess = bindFirst(endResponse, input.res);
  const onError = bindFirst(endResponseWithError, input.res);
  return Promise.resolve(input.outcome).then(onSuccess, onError);
}

function endResponse(res) {
  res.end();
  return true;
}

function endResponseWithError(res) {
  res.end();
  return false;
}

class MemorySessionStore {
  constructor() {
    this.cache = new Map();
  }

  load(sessionId) {
    return this.cache.get(toSessionKey(sessionId)) ?? null;
  }

  save(sessionId, state) {
    this.cache.set(toSessionKey(sessionId), state);
    return true;
  }
}

class NodeSseEventStream {
  constructor(options) {
    this.res = options.res;
  }

  emit(event) {
    return writeSseEvent({ res: this.res, event });
  }

  emitMany(events) {
    return writeSseEvents({ res: this.res, events });
  }
}

function createNodeSseEventStream(options) {
  return new NodeSseEventStream(options);
}

function writeSseEvent(input) {
  try {
    input.res.write(formatSseEvent(input.event));
    return true;
  } catch {
    return false;
  }
}

function writeSseEvents(input) {
  try {
    for (const event of input.events) {
      input.res.write(formatSseEvent(event));
    }
    return true;
  } catch {
    return false;
  }
}

function formatSseEvent(event) {
  return `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function toSessionKey(sessionId) {
  return typeof sessionId === "string" ? sessionId : sessionId.sessionId;
}

const CLIENT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>llm-core Interaction Demo</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; }
      input { width: 320px; padding: 6px 8px; }
      button { margin-left: 8px; }
      pre { background: #f5f5f5; padding: 12px; }
    </style>
  </head>
  <body>
    <h1>Interaction SSE Demo</h1>
    <p>This demo uses the built-in model. Try a message below.</p>
    <form id="chat-form">
      <input id="message" name="message" placeholder="Say hello..." />
      <button type="submit">Send</button>
    </form>
    <pre id="output"></pre>
    <script>
      const form = document.getElementById("chat-form");
      const output = document.getElementById("output");
      const messageInput = document.getElementById("message");

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        output.textContent = "";
        const message = messageInput.value || "Hello from llm-core";
        const source = new EventSource(\`/chat?message=\${encodeURIComponent(message)}\`);

        source.addEventListener("interaction.model", (event) => {
          const payload = JSON.parse(event.data);
          output.textContent += JSON.stringify(payload, null, 2) + "\\n";
        });

        source.addEventListener("interaction.trace", (event) => {
          const payload = JSON.parse(event.data);
          output.textContent += JSON.stringify(payload, null, 2) + "\\n";
        });

        source.addEventListener("interaction.diagnostic", (event) => {
          const payload = JSON.parse(event.data);
          output.textContent += JSON.stringify(payload, null, 2) + "\\n";
        });

        source.addEventListener("interaction.event-stream", (event) => {
          const payload = JSON.parse(event.data);
          output.textContent += JSON.stringify(payload, null, 2) + "\\n";
        });

        source.onerror = () => {
          source.close();
        };
      });
    </script>
  </body>
</html>`;
