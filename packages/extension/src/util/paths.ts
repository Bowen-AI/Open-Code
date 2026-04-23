import * as path from "path";
import * as fs from "fs";
import { ExtensionContext } from "vscode";

export function resolveMemorydBinary(_ctx: ExtensionContext): string | undefined {
  const fromEnv = process.env.OPEN_CODE_MEMORYD_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const extRoot = _ctx.extensionPath;
  // packages/extension -> repo root: ../..
  const root = path.join(extRoot, "..", "..");
  const name = process.platform === "win32" ? "open-code-memoryd.exe" : "open-code-memoryd";
  const rel = path.join(root, "target", "release", name);
  if (fs.existsSync(rel)) {
    return rel;
  }
  return undefined;
}

export function getRepoRootForWorkspace(
  firstFolder: string | undefined
): string | undefined {
  return firstFolder;
}
