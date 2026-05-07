import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const extensionPackage = JSON.parse(read("packages/extension/package.json"));
const desktopPackage = JSON.parse(read("packages/desktop/package.json"));
const logicProject = JSON.parse(read("logic/open-code.project.json"));
const modelManifest = JSON.parse(read("runtime/model-manifest.json"));
const commands = extensionPackage.contributes.commands.map((c) => c.command);

for (const command of [
  "open-code.startAutodrive",
  "open-code.runAgent",
  "open-code.reviewProposed",
  "open-code.revertLastChange",
  "open-code.health",
  "open-code.setCredentialRef",
  "open-code.deleteCredentialRef",
  "open-code.clearMemory",
  "open-code.showMemory",
  "open-code.discriminateCommit"
]) {
  assert(commands.includes(command), `Missing contributed command: ${command}`);
}

assert(
  extensionPackage.contributes.configuration.properties["openCode.gemmaModel"].default === "gemma3:4b",
  "openCode.gemmaModel must default to gemma3:4b"
);
assert(modelManifest.defaultModel === "gemma3:4b", "runtime model manifest must default to gemma3:4b");
assert(desktopPackage.name === "open-code-desktop", "desktop package must be named open-code-desktop");
assert(logicProject.cards?.length >= 3, "logic project must include starter logic cards");
assert(
  logicProject.cards.some((card) => card.status === "running" && card.implementationBranch),
  "logic project must model a running branch-per-card agent"
);
assert(
  logicProject.cards.some((card) => card.id === "card-documentation-presentations"),
  "logic project must include documentation presentation logic"
);
assert(
  modelManifest.models.some((m) => m.id === "gemma3:4b" && m.verification?.mode),
  "runtime model manifest must describe gemma3:4b verification"
);

for (const rel of [
  "docs/AGENT_HANDOFF.md",
  "docs/AGENT_RUNTIME.md",
  "docs/DOCUMENTATION_PRESENTATIONS.md",
  "docs/E2E_READINESS.md",
  "docs/GA_RELEASE_READINESS.md",
  "docs/LOGIC_WORKSPACE.md",
  "docs/MVP_DELIVERY_TRACK.md",
  "docs/MVP_EXECUTION_PLAN.md",
  "docs/MVP_AND_ROADMAP.md",
  "logic/open-code.project.json",
  "logic/open-code.paper.md",
  "packages/desktop/src/App.svelte",
  "packages/desktop/src-tauri/src/main.rs",
  "runtime/model-manifest.json",
  "scripts/e2e-local-model.mjs",
  "scripts/e2e-mvp.mjs",
  "scripts/probe-memoryd.mjs",
  "packages/extension/test/runTest.mjs",
  "packages/extension/test/suite/index.js"
]) {
  assert(fs.existsSync(path.join(root, rel)), `Missing documentation file: ${rel}`);
}

const readme = read("README.md");
assert(readme.includes("docs/AGENT_HANDOFF.md"), "README must link docs/AGENT_HANDOFF.md");
assert(readme.includes("docs/E2E_READINESS.md"), "README must link docs/E2E_READINESS.md");
assert(readme.includes("docs/GA_RELEASE_READINESS.md"), "README must link docs/GA_RELEASE_READINESS.md");

const rootPackage = JSON.parse(read("package.json"));
assert(rootPackage.scripts["test:memoryd:probe"], "package.json must include test:memoryd:probe");
assert(
  read("scripts/e2e-mvp.mjs").includes("test:memoryd:probe"),
  "E2E matrix must include memory daemon HTTP probe"
);

const handoff = read("docs/AGENT_HANDOFF.md");
for (const phrase of [
  "Agent Quick Read",
  "Current Working Pieces",
  "Missing Pieces Inventory",
  "Recommended Build Order",
  "Problems, Improvements, And Risks"
]) {
  assert(handoff.includes(phrase), `AGENT_HANDOFF.md missing section: ${phrase}`);
}

const searchedFiles = [
  "README.md",
  "docs/AGENT_HANDOFF.md",
  "docs/MVP_EXECUTION_PLAN.md",
  "packages/extension/src/extension.ts",
  "packages/extension/src/providers/gemmaLocal.ts",
  "packages/extension/src/agent/reviewController.ts"
];
const retiredModel = "gemma" + "2";
for (const rel of searchedFiles) {
  assert(!read(rel).includes(retiredModel), `${rel} still references ${retiredModel}`);
}

console.log("Open Code bootstrap checks passed.");
