#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-code-memoryd-"));
const portFile = path.join(dataDir, "port.txt");
const projectId = `probe-${Date.now()}`;
const env = buildEnv();

let stdout = "";
let stderr = "";
const started = performance.now();
const child = spawn(
  "cargo",
  [
    "run",
    "-p",
    "open-code-memory",
    "--bin",
    "open-code-memoryd",
    "--",
    "--data-dir",
    dataDir,
    "--port-file",
    portFile
  ],
  {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  const port = await waitForPortFile();
  const startupMs = performance.now() - started;
  const baseUrl = `http://127.0.0.1:${port}`;
  const apiStarted = performance.now();

  const health = await getJson(baseUrl, "/v1/health");
  assert(health.ok === true, "health endpoint must report ok");

  const rawIds = [];
  for (let index = 0; index < 25; index += 1) {
    const raw = await postJson(baseUrl, "/v1/raw/append", {
      project_id: projectId,
      session_id: "probe-session",
      kind: "message",
      payload: { index, text: `probe ${index}` }
    });
    assert(typeof raw.id === "string" && raw.id.length > 0, "raw append must return an id");
    rawIds.push(raw.id);
  }

  const semantic = await postJson(baseUrl, "/v1/semantic/append", {
    project_id: projectId,
    kind: "summary",
    body: { text: "memory daemon probe" },
    source_raw_ids: [rawIds[0]]
  });
  assert(
    typeof semantic.id === "string" && semantic.id.length > 0,
    "semantic append must return an id"
  );

  const recent = await getJson(
    baseUrl,
    `/v1/raw/recent?project_id=${encodeURIComponent(projectId)}&limit=10`
  );
  assert(Array.isArray(recent.items), "recent raw response must include items");
  assert(recent.items.length === 10, "recent raw must honor the requested limit");
  assert(recent.items[0].payload.text.startsWith("probe "), "recent raw must include payloads");

  const cleared = await postJson(baseUrl, "/v1/raw/clear", {
    project_id: projectId
  });
  assert(cleared.deleted === 26, "clear must remove raw and semantic project records");

  const afterClear = await getJson(
    baseUrl,
    `/v1/raw/recent?project_id=${encodeURIComponent(projectId)}&limit=10`
  );
  assert(afterClear.items.length === 0, "recent raw must be empty after clear");

  const apiMs = performance.now() - apiStarted;
  assert(startupMs < 15_000, `memoryd startup took ${startupMs.toFixed(1)}ms`);
  assert(apiMs < 3_000, `memoryd API probe took ${apiMs.toFixed(1)}ms`);

  console.log(
    `Memory daemon probe passed: startup ${startupMs.toFixed(1)}ms; API ${apiMs.toFixed(1)}ms; base ${baseUrl}`
  );
} catch (error) {
  if (canSkipBindFailure(error)) {
    console.log(
      "Memory daemon probe skipped: this sandbox blocks localhost listener startup (EPERM). Run with OPEN_CODE_MEMORYD_PROBE_STRICT=1 in a release-capable environment."
    );
  } else {
    throw error;
  }
} finally {
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function waitForPortFile() {
  const timeoutMs = 15_000;
  while (performance.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`memoryd exited early with ${child.exitCode}\n${processOutput()}`);
    }
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf8").trim();
      if (/^\d+$/.test(port)) {
        return port;
      }
    }
    await sleep(50);
  }
  throw new Error(`memoryd did not write a port file within ${timeoutMs}ms\n${processOutput()}`);
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${pathname} failed: HTTP ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${pathname} failed: HTTP ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function processOutput() {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canSkipBindFailure(error) {
  const ci = process.env.CI && process.env.CI !== "false";
  if (ci || process.env.OPEN_CODE_MEMORYD_PROBE_STRICT === "1") {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /Operation not permitted|os error 1|EACCES|EPERM/.test(message);
}

function buildEnv() {
  const next = { ...process.env };
  const toolchainDir = path.join(root, ".open-code", "toolchain");
  const cargoHome = path.join(toolchainDir, "cargo");
  const rustupHome = path.join(toolchainDir, "rustup");
  const pathParts = [];

  if (fs.existsSync(cargoHome)) {
    next.CARGO_HOME ||= cargoHome;
    pathParts.push(path.join(cargoHome, "bin"));
  }
  if (fs.existsSync(rustupHome)) {
    next.RUSTUP_HOME ||= rustupHome;
  }

  const nodeBin = findSandboxNodeBin(toolchainDir);
  if (nodeBin) {
    pathParts.push(nodeBin);
  }

  if (pathParts.length > 0) {
    next.PATH = `${pathParts.join(path.delimiter)}${path.delimiter}${next.PATH || ""}`;
  }

  return next;
}

function findSandboxNodeBin(toolchainDir) {
  if (!fs.existsSync(toolchainDir)) {
    return undefined;
  }
  for (const entry of fs.readdirSync(toolchainDir)) {
    if (!entry.startsWith("node-")) {
      continue;
    }
    const bin = path.join(toolchainDir, entry, "bin");
    if (fs.existsSync(path.join(bin, "npm"))) {
      return bin;
    }
  }
  return undefined;
}
