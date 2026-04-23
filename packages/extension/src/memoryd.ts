import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ExtensionContext } from "vscode";
import { resolveMemorydBinary } from "./util/paths";

let proc: child_process.ChildProcess | undefined;
let baseUrl: string | undefined;

export function getMemoryBaseUrl(): string | undefined {
  return baseUrl;
}

export async function startMemoryd(
  context: ExtensionContext
): Promise<string | undefined> {
  if (baseUrl) {
    return baseUrl;
  }
  const bin = resolveMemorydBinary(context);
  if (!bin) {
    return undefined;
  }
  const dataDir = path.join(context.globalStorageUri.fsPath, "memory");
  const portFile = path.join(dataDir, "port.txt");
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(portFile)) {
    try {
      fs.unlinkSync(portFile);
    } catch {
      // ignore
    }
  }
  proc = child_process.spawn(
    bin,
    ["--data-dir", dataDir, "--port-file", portFile],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  // Wait for port file
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf8").trim();
      if (port) {
        baseUrl = `http://127.0.0.1:${port}`;
        return baseUrl;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

export function stopMemoryd() {
  if (proc) {
    try {
      proc.kill();
    } catch {
      // ignore
    }
    proc = undefined;
  }
  baseUrl = undefined;
}
