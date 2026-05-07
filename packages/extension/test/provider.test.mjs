import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import http from "node:http";
import providerModule from "../out/providers/gemmaLocal.js";

const { GemmaLocalProvider, normalizeLocalRuntimeBaseUrl } = providerModule;

const originalGet = http.get;
const originalRequest = http.request;
const requests = [];

http.get = (options, callback) => mockRequest("GET", options, callback);
http.request = (options, callback) => mockRequest(options.method ?? "GET", options, callback);

try {
  assert.equal(normalizeLocalRuntimeBaseUrl("127.0.0.1"), "http://127.0.0.1:11434");
  assert.equal(normalizeLocalRuntimeBaseUrl("http://localhost:1234/"), "http://localhost:1234");
  assert.throws(() => normalizeLocalRuntimeBaseUrl("file:///tmp/model.sock"), /Unsupported/);

  const provider = new GemmaLocalProvider("http://127.0.0.1:11434", "gemma3:4b");
  const health = await provider.health();
  assert.equal(health.ok, true);
  assert.equal(health.installed, true);
  assert.equal(health.endpoint, "ollama");
  assert.deepEqual(health.models, ["gemma3:4b", "gemma3n:e4b"]);

  const missing = new GemmaLocalProvider("http://127.0.0.1:11434", "gemma3:12b");
  const missingHealth = await missing.health();
  assert.equal(missingHealth.ok, false);
  assert.equal(missingHealth.installed, false);
  assert.match(missingHealth.error ?? "", /not installed/);

  const reply = await provider.complete([{ role: "user", content: "ping" }]);
  assert.equal(reply, "ready:gemma3:4b");
  assert.deepEqual(
    requests.filter((request) => request.method === "POST").map((request) => request.path),
    ["/v1/chat/completions", "/api/chat"]
  );

  const stalled = new GemmaLocalProvider("http://127.0.0.1:11434", "stall-model");
  await assert.rejects(
    stalled.complete([{ role: "user", content: "ping" }], { timeoutMs: 5 }),
    /timed out/
  );

  console.log("Extension provider unit tests passed.");
} finally {
  http.get = originalGet;
  http.request = originalRequest;
}

function mockRequest(method, options, callback) {
  let body = "";
  let timer;
  const req = new EventEmitter();
  req.write = (chunk) => {
    body += chunk;
  };
  req.end = () => {
    handleRequest(req, method, options, callback, body, () => clearTimeout(timer));
  };
  req.setTimeout = (ms, onTimeout) => {
    timer = setTimeout(onTimeout, ms);
    return req;
  };
  req.destroy = (error) => {
    clearTimeout(timer);
    queueMicrotask(() => req.emit("error", error));
  };

  if (method === "GET") {
    queueMicrotask(() => {
      handleRequest(req, method, options, callback, body, () => clearTimeout(timer));
    });
  }

  return req;
}

function handleRequest(req, method, options, callback, body, done) {
  const path = options.path;
  requests.push({ method, path, body });

  if (body.includes("stall-model")) {
    return;
  }

  if (method === "GET" && path === "/api/tags") {
    done();
    respond(callback, 200, { models: [{ name: "gemma3:4b" }, { model: "gemma3n:e4b" }] });
    return;
  }

  if (method === "POST" && path === "/v1/chat/completions") {
    done();
    respond(callback, 404, { error: "not enabled" });
    return;
  }

  if (method === "POST" && path === "/api/chat") {
    done();
    const parsed = JSON.parse(body);
    respond(callback, 200, { message: { content: `ready:${parsed.model}` } });
    return;
  }

  done();
  respond(callback, 404, { error: "missing route" });
}

function respond(callback, statusCode, body) {
  const res = new Readable({ read() {} });
  res.statusCode = statusCode;
  callback(res);
  res.push(JSON.stringify(body));
  res.push(null);
}
