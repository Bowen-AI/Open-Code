import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, "..");
const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");

const invalidCachedApp = findInvalidCachedMacApp(extensionDevelopmentPath);
if (invalidCachedApp) {
  throw new Error(
    [
      "Cached VS Code test app has an invalid macOS code signature.",
      `Path: ${invalidCachedApp.appPath}`,
      invalidCachedApp.reason,
      "Remove packages/extension/.vscode-test/vscode-darwin-arm64-* and rerun in a network-enabled, GUI-capable environment so @vscode/test-electron can download a fresh app."
    ].join("\n")
  );
}

await runTests({
  extensionDevelopmentPath,
  extensionTestsPath
});

function findInvalidCachedMacApp(extensionPath) {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const testDir = path.join(extensionPath, ".vscode-test");
  if (!fs.existsSync(testDir)) {
    return undefined;
  }
  for (const entry of fs.readdirSync(testDir)) {
    if (!entry.startsWith("vscode-darwin")) {
      continue;
    }
    const appPath = path.join(testDir, entry, "Visual Studio Code.app");
    if (!fs.existsSync(appPath)) {
      continue;
    }
    const result = spawnSync("codesign", ["--verify", "--deep", "--strict", appPath], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      return {
        appPath,
        reason: [result.stderr, result.stdout].filter(Boolean).join("\n").trim()
      };
    }
  }
  return undefined;
}
