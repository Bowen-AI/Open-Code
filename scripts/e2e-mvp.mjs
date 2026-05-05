#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));
const skipModel = args.has("--skip-model") || process.env.OPEN_CODE_E2E_SKIP_MODEL === "1";
const skipExtension =
  args.has("--skip-extension") || process.env.OPEN_CODE_E2E_SKIP_EXTENSION === "1";

const env = buildEnv();
const steps = [
  {
    stream: "bootstrap/docs contract",
    command: "npm",
    args: ["run", "check:bootstrap"]
  },
  {
    stream: "extension TypeScript",
    command: "npm",
    args: ["run", "-w", "open-code-vscode-extension", "check"]
  },
  {
    stream: "desktop Svelte contract",
    command: "npm",
    args: ["run", "check:desktop"]
  },
  {
    stream: "desktop preview workflows",
    command: "npm",
    args: ["run", "test:desktop:preview"]
  },
  {
    stream: "workspace build",
    command: "npm",
    args: ["run", "build"]
  },
  {
    stream: "logic core",
    command: "npm",
    args: ["run", "test:logic"]
  },
  {
    stream: "memory daemon",
    command: "npm",
    args: ["run", "test:rust:required"]
  }
];

if (!skipExtension) {
  steps.push({
    stream: "VS Code extension activation",
    command: "npm",
    args: ["run", "-w", "open-code-vscode-extension", "test"]
  });
}

if (!skipModel) {
  steps.push({
    stream: "local Gemma model",
    command: "node",
    args: ["scripts/e2e-local-model.mjs"]
  });
}

console.log("Open Code MVP E2E readiness matrix");
console.log(`- extension smoke: ${skipExtension ? "skipped" : "required"}`);
console.log(`- local model: ${skipModel ? "skipped" : "required"}`);
console.log("");

for (const step of steps) {
  runStep(step);
}

console.log("");
console.log("Open Code MVP E2E readiness matrix passed.");

function runStep(step) {
  const printable = [step.command, ...step.args].join(" ");
  console.log(`\n[e2e] ${step.stream}`);
  console.log(`[e2e] $ ${printable}`);
  const result = spawnSync(step.command, step.args, {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.error) {
    console.error(`[e2e] ${step.stream} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    const suffix = result.signal ? ` signal ${result.signal}` : ` exit ${result.status}`;
    console.error(`[e2e] ${step.stream} failed with${suffix}.`);
    process.exit(result.status || 1);
  }
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
