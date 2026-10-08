import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "nodejs",
  project: "telemetry-ingest",
  branch: "perf/ndjson-stream-parser",
  indent: "Spaces: 2",
  files: [
    "package.json",
    "src/server.js",
    "src/lib/ndjson-parser.js",
    "src/lib/reading-writer.js",
    "src/lib/auth.js",
    "src/lib/logger.js",
    "test/ndjson-parser.test.js",
    ".env.example",
  ],
  snippets: [
    {
      filename: "src/server.js",
      syntax: "clike",
      languageLabel: "JavaScript",
      code: `import { createServer } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { NdjsonParser } from "./lib/ndjson-parser.js";
import { ReadingWriter } from "./lib/reading-writer.js";
import { verifyDeviceToken } from "./lib/auth.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 5 * 1024 * 1024);
const INGEST_PATH = "/v1/readings";

class PayloadTooLargeError extends Error {}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function byteLimit(max) {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length;
      if (seen > max) return callback(new PayloadTooLargeError("body exceeds " + max));
      callback(null, chunk);
    },
  });
}

async function handleIngest(req, res, requestId) {
  const deviceId = await verifyDeviceToken(req.headers.authorization);
  if (!deviceId) {
    return sendJson(res, 401, { error: "unauthorised", requestId });
  }

  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    res.setHeader("connection", "close");
    return sendJson(res, 413, { error: "payload too large", requestId });
  }

  const parser = new NdjsonParser({ maxLineLength: 64 * 1024 });
  const writer = new ReadingWriter({ deviceId, batchSize: 500 });

  try {
    await pipeline(req, byteLimit(MAX_BODY_BYTES), parser, writer);
    sendJson(res, 202, { accepted: writer.count, rejected: parser.rejected, requestId });
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      res.setHeader("connection", "close");
      return sendJson(res, 413, { error: "payload too large", requestId });
    }
    logger.error({ err, requestId, deviceId }, "ingest failed");
    if (!res.headersSent) sendJson(res, 500, { error: "internal error", requestId });
  }
}

const server = createServer(async (req, res) => {
  const incomingId = req.headers["x-request-id"];
  const requestId =
    typeof incomingId === "string" && incomingId.length <= 64 ? incomingId : randomUUID();
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && url.pathname === INGEST_PATH) {
    return handleIngest(req, res, requestId);
  }
  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 404, { error: "not found", requestId });
});

server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, () => logger.info({ port: PORT }, "telemetry ingest listening"));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    logger.info({ signal }, "draining connections");
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}`,
    },
    {
      filename: "src/lib/ndjson-parser.js",
      syntax: "clike",
      languageLabel: "JavaScript",
      code: `import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const REQUIRED_FIELDS = ["sensorId", "metric", "value", "recordedAt"];
const METRICS = new Set(["temperature", "humidity", "pressure", "co2"]);
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

// Splits a byte stream into newline-delimited JSON records.
// Emits validated reading objects; malformed lines are counted, not thrown.
export class NdjsonParser extends Transform {
  #decoder = new StringDecoder("utf8");
  #buffer = "";
  #maxLineLength;
  rejected = 0;

  constructor({ maxLineLength = 65_536 } = {}) {
    super({ readableObjectMode: true, readableHighWaterMark: 256 });
    this.#maxLineLength = maxLineLength;
  }

  _transform(chunk, _encoding, callback) {
    this.#buffer += this.#decoder.write(chunk);
    let start = 0;
    let newline = this.#buffer.indexOf("\\n", start);
    while (newline !== -1) {
      const line = this.#buffer.slice(start, newline).trim();
      if (line) this.#handleLine(line);
      start = newline + 1;
      newline = this.#buffer.indexOf("\\n", start);
    }
    this.#buffer = this.#buffer.slice(start);
    if (this.#buffer.length > this.#maxLineLength) {
      return callback(new Error("line exceeds " + this.#maxLineLength + " characters"));
    }
    callback();
  }

  _flush(callback) {
    this.#buffer += this.#decoder.end();
    const tail = this.#buffer.trim();
    if (tail) this.#handleLine(tail);
    this.#buffer = "";
    callback();
  }

  #handleLine(line) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      this.rejected += 1;
      return;
    }
    const reading = toReading(record);
    if (reading) this.push(reading);
    else this.rejected += 1;
  }
}

export function toReading(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return null;
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) return null;
  }
  if (!METRICS.has(record.metric)) return null;

  const value = Number(record.value);
  if (!Number.isFinite(value)) return null;

  const recordedAt = new Date(record.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) return null;
  if (recordedAt.getTime() - Date.now() > MAX_FUTURE_SKEW_MS) return null;

  return {
    sensorId: String(record.sensorId).slice(0, 64),
    metric: record.metric,
    value,
    recordedAt,
  };
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "In `NdjsonParser._transform` I call `this.push()` for every line without checking the return value. Am I breaking backpressure?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Not in a way that matters here. In a `Transform`, backpressure is enforced through the **callback**: if the readable side is above its high-water mark, Node holds your `_transform` callback until the consumer reads, so no new chunks arrive.\n\nWithin a single chunk you can overshoot the high-water mark, because one 64 KiB chunk might contain hundreds of lines. That overshoot is bounded by the chunk size, so memory stays predictable. I set `readableHighWaterMark: 256` so `ReadingWriter` gets a reasonable batch without the buffer growing unchecked.\n\nIf you ever push large objects, check `push()` and stop early instead, keeping the leftover lines in `#buffer`.",
      delay: 11000,
    },
    {
      role: "user",
      content:
        "Earlier I had `this.#buffer = this.#buffer.slice(newline + 1)` inside the loop. Why did you change it to a `start` index?",
      delay: 23000,
    },
    {
      role: "assistant",
      content:
        "Slicing the remainder on every line copies the rest of the buffer each time, so a chunk with `n` short lines costs roughly O(n²) character copies. With a 64 KiB chunk of 80-byte lines that is about 800 copies of a shrinking string per chunk, which showed up as CPU spikes on large uploads.\n\nTracking `start` and slicing once after the loop keeps it linear:\n\n```js\nlet start = 0;\nwhile ((nl = buf.indexOf('\\n', start)) !== -1) {\n  handle(buf.slice(start, nl));\n  start = nl + 1;\n}\nbuf = buf.slice(start);\n```\n\nThe `maxLineLength` check after the loop still guards against a client that never sends a newline.",
      delay: 35000,
    },
    {
      role: "user",
      content: "Do I still need `byteLimit` now that `requestTimeout` is set to 30 seconds?",
      delay: 47000,
    },
    {
      role: "assistant",
      content:
        "Yes. They protect against different things:\n\n1. `requestTimeout` limits **time**. A fast client can still send several gigabytes in 30 seconds.\n2. The `content-length` check only works when the header is present. With `Transfer-Encoding: chunked` it is absent, so `declared` is 0.\n3. `byteLimit` counts the bytes actually received, so it covers both cases.\n\nWhen the limit trips, `pipeline` destroys `req`. That is why I set `connection: close` on the 413: the rest of the body can't be read safely, so the socket shouldn't go back to the keep-alive pool. A test that streams `MAX_BODY_BYTES + 1` bytes in chunked mode would cover this path.",
      delay: 58000,
    },
  ],
};

export default config;
