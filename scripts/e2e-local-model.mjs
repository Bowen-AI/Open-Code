#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  askOllama,
  checkOllama,
  DEFAULT_MODEL,
  installHint
} from "../packages/desktop/preview/models.js";

const baseUrl = process.env.OPEN_CODE_E2E_BASE_URL || "http://127.0.0.1:11434";
const requestedModel = process.env.OPEN_CODE_E2E_MODEL || DEFAULT_MODEL;
const shouldPull = process.env.OPEN_CODE_E2E_PULL_MODEL === "1";

function fail(message) {
  console.error(`[e2e:local-model] ${message}`);
  process.exit(1);
}

function pullModel(model) {
  const result = spawnSync("ollama", ["pull", model], {
    stdio: "inherit",
    env: process.env
  });
  if (result.error) {
    fail(`Unable to run ollama pull: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`ollama pull ${model} exited with ${result.status}`);
  }
}

async function readHealth() {
  try {
    return await checkOllama(baseUrl, "custom", requestedModel);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(
      `Ollama is not reachable at ${baseUrl}. Start Ollama first, or run scripts/install-mvp-macos-linux.sh. ${reason}`
    );
  }
}

let health = await readHealth();
if (!health.installed) {
  if (shouldPull) {
    console.log(`[e2e:local-model] ${health.selectedModel} is missing; pulling it now.`);
    pullModel(health.selectedModel);
    health = await readHealth();
  }

  if (!health.installed) {
    fail(
      `${health.selectedModel} is not installed. ${installHint(health.selectedModel)}`
    );
  }
}

const reply = await askOllama(baseUrl, health.selectedModel, [
  {
    role: "system",
    content:
      "You are the Open Code local readiness probe. Reply briefly and do not mention remote APIs."
  },
  {
    role: "user",
    content:
      "Reply in one short sentence saying the Open Code local model is ready."
  }
]);

const trimmedReply = reply.replace(/\s+/g, " ").trim();
if (trimmedReply.length < 2) {
  fail(`${health.selectedModel} returned an empty readiness response.`);
}

console.log(`[e2e:local-model] Ollama ready at ${health.baseUrl}`);
console.log(`[e2e:local-model] Installed models: ${health.installedModels.join(", ")}`);
console.log(`[e2e:local-model] ${health.selectedModel} response: ${trimmedReply.slice(0, 220)}`);
